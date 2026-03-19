import { describe, test, expect } from "bun:test";
// This import will fail until Wave 2 creates the file
import { parseStreamForModeEvents } from "../src/server/mode-interceptor";


describe("parseStreamForModeEvents", () => {
  test("detects discuss_mode_start and strips from text", () => {
    const input = 'Hello <discuss_mode_start total="5" /> world';
    const { events, stripped } = parseStreamForModeEvents(input, "");
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("discuss_mode_start");
    expect(events[0].total).toBe(5);
    expect(stripped).toBe("Hello  world");
  });

  test("detects discuss_mode_end", () => {
    const { events } = parseStreamForModeEvents("<discuss_mode_end />", "");
    expect(events[0].type).toBe("discuss_mode_end");
  });

  test("returns empty events and original text for normal content", () => {
    const { events, stripped } = parseStreamForModeEvents("Just normal text", "");
    expect(events).toHaveLength(0);
    expect(stripped).toBe("Just normal text");
  });

  test("buffers incomplete XML and returns empty events", () => {
    const { events, stripped, remainder } = parseStreamForModeEvents("<discuss_mode_s", "");
    expect(events).toHaveLength(0);
    expect(stripped).toBe("");
    expect(remainder).toBe("<discuss_mode_s");
  });

  test("detects question_card with multiple_choice type", () => {
    const xml = `<question id="1" area="Layout" type="multiple_choice" number="1" total="3">Which layout?<options><option value="cards">Cards</option></options></question>`;
    const { events } = parseStreamForModeEvents(xml, "");
    expect(events[0].type).toBe("question_card");
    expect(events[0].question?.type).toBe("multiple_choice");
    expect(events[0].question?.area).toBe("Layout");
    expect(events[0].question?.options).toHaveLength(1);
  });

  test("detects review_mode_start with pillar data", () => {
    const xml = `<review_mode_start><pillar name="Accessibility" score="7.2"><finding>CTA lacks contrast</finding></pillar><fix priority="1" pillar="Accessibility">Fix contrast</fix></review_mode_start>`;
    const { events } = parseStreamForModeEvents(xml, "");
    expect(events[0].type).toBe("review_mode_start");
    expect(events[0].results?.pillars).toHaveLength(1);
    expect(events[0].results?.pillars[0].score).toBe(7.2);
    expect(events[0].results?.topFixes).toHaveLength(1);
  });
});

describe("dev_server_detected", () => {
  test("extracts port from 'Server running on localhost:3000'", () => {
    const { events } = parseStreamForModeEvents("Server running on localhost:3000", "");
    const devEvents = events.filter((e) => e.type === "dev_server_detected");
    expect(devEvents).toHaveLength(1);
    expect(devEvents[0].port).toBe(3000);
  });

  test("extracts port from 'http://127.0.0.1:5173'", () => {
    const { events } = parseStreamForModeEvents("http://127.0.0.1:5173", "");
    const devEvents = events.filter((e) => e.type === "dev_server_detected");
    expect(devEvents).toHaveLength(1);
    expect(devEvents[0].port).toBe(5173);
  });

  test("does NOT emit dev_server_detected for port 4000 (Mission Control HTTP)", () => {
    const { events } = parseStreamForModeEvents("Running at http://localhost:4000", "");
    const devEvents = events.filter((e) => e.type === "dev_server_detected");
    expect(devEvents).toHaveLength(0);
  });

  test("does NOT emit dev_server_detected for port 4001 (Mission Control WS)", () => {
    const { events } = parseStreamForModeEvents("WebSocket server at localhost:4001", "");
    const devEvents = events.filter((e) => e.type === "dev_server_detected");
    expect(devEvents).toHaveLength(0);
  });

  test("does NOT emit dev_server_detected for non-localhost URLs like https://github.com", () => {
    const { events } = parseStreamForModeEvents("See https://github.com/user/repo for details", "");
    const devEvents = events.filter((e) => e.type === "dev_server_detected");
    expect(devEvents).toHaveLength(0);
  });
});
