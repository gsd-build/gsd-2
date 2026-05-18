# Model Routing Interativo

Extensão do GSD que ativa o sistema de model routing (complexity classification + capability scoring + token profiles) no modo interativo, não apenas no auto-mode.

## Language

**Turn phase**: a fase do workflow que o agente está executando num dado turn da conversa (discuss, plan, execute, validate). Inferida a partir das ferramentas invocadas ou declarada pela skill/issue.
_Avoid_: unit type (termo do GSD auto-mode), task type

**Complexity tier**: classificação de complexidade do trabalho atual — `light`, `standard`, ou `heavy`. Determina qual pool de modelos é elegível pro routing.
_Avoid_: difficulty, level

**Routing decision**: resultado do pipeline classification → tier → capability scoring → model selection. Inclui modelo escolhido, fallbacks, tier, e reason.
_Avoid_: model choice, model pick

**Issue complexity**: metadata de complexidade carregada na issue (label `complexity:*` + campos estruturais como fileCount, tags, complexityKeywords). Alimenta o classifier quando o agente trabalha numa issue.
_Avoid_: issue difficulty

**Token profile**: preset de custo/qualidade que define defaults de modelos e phases skipáveis. Um de: `budget`, `balanced`, `quality`, `burn-max`.
_Avoid_: cost profile, plan

**Capability profile**: vetor de 7 dimensões (coding, debugging, research, reasoning, speed, longContext, instruction) que descreve as capacidades de um modelo. Usado pelo capability scoring.
_Avoid_: model profile, model specs

**Routing history**: registro persistido de sucessos/falhas por (project, tier, model). Alimenta adaptive learning — o router escala o tier pra cima quando um modelo falha repetidamente num tipo de tarefa.
_Avoid_: model log, model stats

## Relationships

- Um **Token profile** define quais **Complexity tiers** são usados por default em cada **Turn phase**
- Uma **Issue complexity** (label + metadata) determina o **Complexity tier** quando o agente trabalha numa issue
- O **Routing decision** é produzido pelo pipeline: turn phase → tier → capability scoring → model
- **Routing history** influencia o **Complexity tier** via adaptive learning (escala pra cima em caso de falha repetida)
- **Capability profiles** são usados pelo capability scoring pra rankear modelos dentro de um tier

## Workflow phases → Tier mapping

| Workflow                      | Turn phase inferido | Tier default | Sinais de upgrade                                     |
| ----------------------------- | ------------------- | ------------ | ----------------------------------------------------- |
| grill-me / grill-me-with-docs | discuss             | standard     | -                                                     |
| Planejar / criar issues       | plan                | heavy        | -                                                     |
| Implementar (issue light)     | execute             | light        | label `complexity:light`                              |
| Implementar (issue standard)  | execute             | standard     | label `complexity:standard`                           |
| Implementar (issue heavy)     | execute             | heavy        | label `complexity:heavy`, tags migration/architecture |
| Review / testes               | validate            | light        | -                                                     |

## Phase inference rules

- **discuss**: agente chamou `ask_user`, ou skill ativa é grill-me/grill-me-with-docs
- **plan**: agente chamou `subagent` com skill to-issues/ce-plan, ou está criando issues
- **execute**: agente chamou `edit`, `write`, ou skill ativa é ce-work
- **validate**: agente chamou `interactive_shell` pra rodar testes, ou skill ativa é ce-test-browser

## Flagged ambiguities

- "auto-mode" (GSD) vs "interactive mode" (pi) — resolvido: o routing agora funciona em ambos, não são modos exclusivos
- "unit type" do GSD vs "turn phase" nosso — resolvido: turn phase é a versão interativa, mapeia diretamente nos unit types do classifier

## Adaptive learning scope

- **Primário**: por projeto (`.gsd/routing-history.json`)
- **Fallback**: global (`~/.gsd/agent/cache/routing-history.json`) quando projeto tem <10 eventos
- **Sinais de falha**: provider error (peso 1.0), tool error (peso 0.7), user signal/Ctrl+C/compact (peso 0.3)
