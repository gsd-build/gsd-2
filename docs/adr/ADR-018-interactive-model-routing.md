# ADR-018: Model Routing Interativo no GSD

O GSD possui model routing (complexity classification + capability scoring + token profiles), mas ele só ativa no auto-mode. Em modo interativo, o agente usa o modelo configurado sem classificação. Decidimos estender o routing pra funcionar em modo interativo também, usando o GSD como base e criando um hook que classifica cada turn e troca o modelo proactively.

## Decisões

1. **Ficar com GSD** — Não copiar módulos. Usar o GSD como base, ativar o que já existe, consertar bugs.

2. **Hook-based routing interativo** — Registrar um hook `before_agent_start` que classifica o contexto do turn atual (phase inference via ferramentas + issue metadata) e chama `classifyUnitComplexity()` → `resolveModelForComplexity()` → `pi.setModel()`.

3. **Phase inference híbrida** — Na conversa livre, inferir a phase via ferramentas invocadas no último turn. Em skills/chains, usar o tipo declarado pela skill. Issues carregam complexity como label + metadata estrutural.

4. **Adaptive learning** — Routing history por projeto com fallback global. Falhas contam (provider error peso 1.0, tool error peso 0.7, user signal peso 0.3).

5. **Downgrade-only preservado** — O routing interativo nunca upgrade além do modelo que o usuário selecionou. Se o usuário está no haiku, o routing não sobe pra opus; só pode sugerir com notificação.

6. **Issue como unit** — Quando o agente está trabalhando numa issue, a issue vira a "unit" do GSD. A label `complexity:*` e metadata na body alimentam o `TaskMetadata` do classifier.

## Consideradas e rejeitadas

- **Copiar módulos do GSD pra extensão standalone** — Rejeitado porque usamos GSD (DB, planning, issues, slices). Copiar criaria manutenção dupla.
- **Contribuir `before_model_select` pro pi core** — Não rejeitado como futuro, mas `before_agent_start` resolve hoje sem mudar o pi.
- **Routing só nos subagents** — Rejeitado porque o maior ganho é na sessão principal, onde a maioria dos tokens são gastos.

## Consequências

- O routing interativo troca modelos entre turns, não dentro de um turn. Isso significa que o modelo do turn N+1 pode ser diferente do turn N, mas dentro do mesmo turn o modelo é fixo.
- Issues sem label de complexidade usam o tier default do classifier baseado em metadata (fileCount, tags, etc.).
- O GSD bugado precisa ser consertado — o routing interativo não resolve bugs do auto-mode existente.
