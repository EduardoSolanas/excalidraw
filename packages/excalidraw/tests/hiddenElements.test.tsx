import React from "react";
import { Excalidraw } from "../index";
import { render, unmountComponent } from "../tests/test-utils";
import { Pointer } from "../tests/helpers/ui";
import { API } from "../tests/helpers/api";
import { actionSelectAll } from "../actions";
import type { ExcalidrawElement } from "../element/types";

unmountComponent();

const mouse = new Pointer("mouse");
const h = window.h;

/** Two overlapping rectangles sharing the same bounds, so a point inside one
 * is inside both, and a box selection over one covers both. */
const makeOverlappingRectangles = () => {
  const back = API.createElement({
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    backgroundColor: "red",
    fillStyle: "solid",
  });
  const front = API.createElement({
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    backgroundColor: "blue",
    fillStyle: "solid",
  });
  return { back, front };
};

const getRenderableIds = (
  isElementHidden?: (el: ExcalidrawElement) => boolean,
) => {
  const { elementsMap } = h.app.renderer.getRenderableElements({
    sceneNonce: h.app.scene.getSceneNonce(),
    zoom: h.state.zoom,
    offsetLeft: h.state.offsetLeft,
    offsetTop: h.state.offsetTop,
    scrollX: h.state.scrollX,
    scrollY: h.state.scrollY,
    height: h.state.height,
    width: h.state.width,
    editingTextElement: h.state.editingTextElement,
    newElementId: h.state.newElement?.id,
    pendingImageElementId: h.state.pendingImageElementId,
    isElementHidden,
  });
  return Array.from(elementsMap.keys());
};

describe("isElementHidden prop", () => {
  it("hidden element is absent from the renderable list", async () => {
    await render(<Excalidraw />);
    const { back, front } = makeOverlappingRectangles();
    API.setElements([back, front]);

    const isElementHidden = (el: ExcalidrawElement) => el.id === front.id;

    const idsWithHiding = getRenderableIds(isElementHidden);
    expect(idsWithHiding).toContain(back.id);
    expect(idsWithHiding).not.toContain(front.id);

    // sanity: without the prop, both are renderable (upstream behaviour)
    const idsWithoutHiding = getRenderableIds(undefined);
    expect(idsWithoutHiding).toContain(back.id);
    expect(idsWithoutHiding).toContain(front.id);
  });

  it("a click at a point inside both elements selects only the visible one", async () => {
    const { back, front } = makeOverlappingRectangles();
    await render(<Excalidraw isElementHidden={(el) => el.id === front.id} />);
    API.setElements([back, front]);

    mouse.clickAt(50, 50);

    expect(API.getSelectedElements().length).toBe(1);
    expect(API.getSelectedElement().id).toBe(back.id);
  });

  it("a click where only the hidden element sits selects nothing", async () => {
    const front = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      backgroundColor: "blue",
      fillStyle: "solid",
    });
    await render(<Excalidraw isElementHidden={(el) => el.id === front.id} />);
    API.setElements([front]);

    mouse.clickAt(50, 50);

    expect(API.getSelectedElements().length).toBe(0);
  });

  it("box selection skips the hidden element", async () => {
    const { back, front } = makeOverlappingRectangles();
    await render(<Excalidraw isElementHidden={(el) => el.id === front.id} />);
    API.setElements([back, front]);

    mouse.downAt(-10, -10);
    mouse.moveTo(150, 150);
    mouse.upAt(150, 150);

    expect(API.getSelectedElements().length).toBe(1);
    expect(API.getSelectedElement().id).toBe(back.id);
  });

  it("select-all skips the hidden element", async () => {
    const { back, front } = makeOverlappingRectangles();
    await render(<Excalidraw isElementHidden={(el) => el.id === front.id} />);
    API.setElements([back, front]);

    API.executeAction(actionSelectAll);

    expect(API.getSelectedElements().length).toBe(1);
    expect(API.getSelectedElement().id).toBe(back.id);
  });

  it("with the prop absent, behaviour is identical to upstream", async () => {
    const { back, front } = makeOverlappingRectangles();
    await render(<Excalidraw />);
    API.setElements([back, front]);

    mouse.clickAt(50, 50);
    expect(API.getSelectedElements().length).toBe(1);
    expect(API.getSelectedElement().id).toBe(front.id);

    API.setSelectedElements([]);
    API.executeAction(actionSelectAll);
    expect(API.getSelectedElements().length).toBe(2);
  });

  it("changing the prop identity re-renders so a previously hidden element becomes renderable", async () => {
    const { back, front } = makeOverlappingRectangles();
    const hideFront = (el: ExcalidrawElement) => el.id === front.id;
    const hideNothing = () => false;

    const { rerender } = await render(
      <Excalidraw isElementHidden={hideFront} />,
    );
    API.setElements([back, front]);

    expect(getRenderableIds(hideFront)).not.toContain(front.id);

    rerender(<Excalidraw isElementHidden={hideNothing} />);

    const idsAfter = getRenderableIds(hideNothing);
    expect(idsAfter).toContain(front.id);
    expect(idsAfter).toContain(back.id);
  });
});
