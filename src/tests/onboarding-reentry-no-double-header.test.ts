import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

test("re-entry onboarding suppresses duplicate intro/header rendering", () => {
  const onboardingSource = readFileSync(
    join(import.meta.dirname, "..", "onboarding.ts"),
    "utf-8",
  )

  assert.match(
    onboardingSource,
    /interface RunOnboardingOptions[\s\S]*showIntro\?: boolean/,
    "runOnboarding should accept a showIntro option",
  )

  assert.match(
    onboardingSource,
    /if \(opts\.showIntro !== false\)[\s\S]*renderLogo\(pc\.cyan\)[\s\S]*p\.intro\(/,
    "runOnboarding should gate logo/intro rendering behind showIntro",
  )

  const handlerSource = readFileSync(
    join(import.meta.dirname, "..", "resources", "extensions", "gsd", "commands", "handlers", "onboarding.ts"),
    "utf-8",
  )

  assert.match(
    handlerSource,
    /runOnboarding\(authStorage, \{ showIntro: false \}\)/,
    "re-entry onboarding handler must suppress onboarding intro/header",
  )
})
