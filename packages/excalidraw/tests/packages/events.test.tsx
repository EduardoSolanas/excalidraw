import React from "react";
import { Excalidraw, CaptureUpdateAction, newElementWith } from "../../index";
import type { ExcalidrawImperativeAPI, StoreIncrementEvent } from "../../types";
import { resolvablePromise } from "../../utils";
import { act, render } from "../test-utils";
import { Keyboard, Pointer, UI } from "../helpers/ui";
import { API } from "../helpers/api";

describe("event callbacks", () => {
  const h = window.h;

  let excalidrawAPI: ExcalidrawImperativeAPI;

  const mouse = new Pointer("mouse");

  beforeEach(async () => {
    const excalidrawAPIPromise = resolvablePromise<ExcalidrawImperativeAPI>();
    await render(
      <Excalidraw
        handleKeyboardGlobally
        excalidrawAPI={(api) => excalidrawAPIPromise.resolve(api as any)}
      />,
    );
    excalidrawAPI = await excalidrawAPIPromise;
  });

  const getIncrementIds = (
    increment: StoreIncrementEvent,
    changeType: "added" | "removed" | "updated",
  ) => Array.from(increment.elementsChange[changeType].keys());

  it("should trigger onChange on render", async () => {
    const changes: Array<[unknown, unknown, unknown]> = [];

    const origBackgroundColor = h.state.viewBackgroundColor;
    excalidrawAPI.onChange((elements, appState, files) => {
      changes.push([elements, appState, files]);
    });
    API.updateScene({
      appState: { viewBackgroundColor: "red" },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.[0]).toEqual([]);
    expect(changes[0]?.[1]).toEqual(
      expect.objectContaining({ viewBackgroundColor: "red" }),
    );
    expect(changes[0]?.[2]).toEqual({});
    expect(
      (changes[0]?.[1] as { viewBackgroundColor?: unknown })
        ?.viewBackgroundColor,
    ).not.toBe(origBackgroundColor);
  });

  it("should trigger onPointerDown/onPointerUp on canvas pointerDown/pointerUp", async () => {
    let pointerDownCount = 0;
    let pointerUpCount = 0;

    excalidrawAPI.onPointerDown(() => {
      pointerDownCount += 1;
    });
    excalidrawAPI.onPointerUp(() => {
      pointerUpCount += 1;
    });

    mouse.downAt(100);
    expect(pointerDownCount).toBe(1);
    expect(pointerUpCount).toBe(0);
    mouse.up();
    expect(pointerDownCount).toBe(1);
    expect(pointerUpCount).toBe(1);
  });

  it("should trigger onIncrement for add, update, remove, and remote source", () => {
    const increments: StoreIncrementEvent[] = [];
    excalidrawAPI.onIncrement((event) => {
      increments.push(event);
    });

    const rectangle = API.createElement({ type: "rectangle", id: "rect-1" });
    API.updateScene({
      elements: [rectangle],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    const updatedRectangle = newElementWith(rectangle, {
      width: rectangle.width + 20,
    });
    API.updateScene({
      elements: [updatedRectangle],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    const deletedRectangle = newElementWith(updatedRectangle, {
      isDeleted: true,
    });
    API.updateScene({
      elements: [deletedRectangle],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    const remoteRectangle = API.createElement({
      type: "rectangle",
      id: "rect-remote",
    });
    API.updateScene({
      elements: [deletedRectangle, remoteRectangle],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      source: "remote",
    });

    expect(increments).toHaveLength(4);
    expect(getIncrementIds(increments[0]!, "added")).toEqual([rectangle.id]);
    expect(increments[0]!.source).toBeUndefined();
    expect(getIncrementIds(increments[1]!, "updated")).toEqual([rectangle.id]);
    expect(getIncrementIds(increments[2]!, "removed")).toEqual([rectangle.id]);
    expect(getIncrementIds(increments[3]!, "added")).toEqual([
      remoteRectangle.id,
    ]);
    expect(increments[3]!.source).toBe("remote");
  });

  it("should stop delivering onIncrement after unsubscribe", () => {
    const increments: StoreIncrementEvent[] = [];
    const unsubscribe = excalidrawAPI.onIncrement((event) => {
      increments.push(event);
    });

    API.updateScene({
      elements: [API.createElement({ type: "rectangle", id: "rect-1" })],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    expect(increments).toHaveLength(1);

    unsubscribe();

    API.updateScene({
      elements: [API.createElement({ type: "rectangle", id: "rect-2" })],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    expect(increments).toHaveLength(1);
  });

  it("should trigger onToolChange for imperative, UI, and keyboard tool changes", () => {
    const tools: Array<{ type: string }> = [];
    excalidrawAPI.onToolChange((tool) => {
      tools.push(tool);
    });

    act(() => {
      excalidrawAPI.setActiveTool({ type: "rectangle" });
    });
    UI.clickTool("ellipse");
    Keyboard.keyPress("r");

    expect(tools).toHaveLength(3);
    expect(tools[0]).toEqual(expect.objectContaining({ type: "rectangle" }));
    expect(tools[1]).toEqual(expect.objectContaining({ type: "ellipse" }));
    expect(tools[2]).toEqual(expect.objectContaining({ type: "rectangle" }));
  });

  it("should continue triggering onChange when onIncrement is subscribed", () => {
    const increments: StoreIncrementEvent[] = [];
    const changes: unknown[] = [];

    excalidrawAPI.onIncrement((event) => {
      increments.push(event);
    });
    excalidrawAPI.onChange((elements) => {
      changes.push(elements);
    });

    UI.createElement("rectangle", { x: 10, y: 10, width: 20, height: 20 });

    expect(increments).toHaveLength(1);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.at(-1)).toEqual([
      expect.objectContaining({ type: "rectangle" }),
    ]);
  });
});
