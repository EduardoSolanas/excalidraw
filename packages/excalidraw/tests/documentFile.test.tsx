import React from "react";
import { vi } from "vitest";
import { waitFor } from "@testing-library/react";

import { render } from "./test-utils";
import { Excalidraw } from "../index";
import { UI } from "./helpers/ui";
import { fileOpen } from "../data/filesystem";

const { h } = window;

vi.mock("../data/filesystem.ts", async (importOriginal) => {
  const module = await importOriginal();
  return {
    __esmodule: true,
    //@ts-ignore
    ...module,
    fileOpen: vi.fn(),
  };
});

const mockedFileOpen = vi.mocked(fileOpen);

describe("onDocumentFile", () => {
  beforeEach(() => {
    mockedFileOpen.mockReset();
  });

  it("calls onDocumentFile once for a picked PDF and adds no element, returning to selection", async () => {
    const onDocumentFile = vi.fn();
    const pdfFile = new File(["%PDF-1.4"], "worksheet.pdf", {
      type: "application/pdf",
    });
    mockedFileOpen.mockResolvedValueOnce(pdfFile);

    await render(<Excalidraw onDocumentFile={onDocumentFile} />);

    UI.clickTool("image");

    await waitFor(() => {
      expect(onDocumentFile).toHaveBeenCalledTimes(1);
    });
    expect(onDocumentFile).toHaveBeenCalledWith(pdfFile);
    expect(h.elements.length).toBe(0);
    await waitFor(() => {
      expect(h.state.activeTool.type).toBe("selection");
    });
  });

  it("recognizes a PDF with an empty type and a .PDF name (case-insensitive)", async () => {
    const onDocumentFile = vi.fn();
    const pdfFile = new File(["%PDF-1.4"], "worksheet.PDF", { type: "" });
    mockedFileOpen.mockResolvedValueOnce(pdfFile);

    await render(<Excalidraw onDocumentFile={onDocumentFile} />);

    UI.clickTool("image");

    await waitFor(() => {
      expect(onDocumentFile).toHaveBeenCalledTimes(1);
    });
    expect(onDocumentFile).toHaveBeenCalledWith(pdfFile);
    expect(h.elements.length).toBe(0);
  });

  it("still creates an image element for a picked PNG and does not call onDocumentFile", async () => {
    const onDocumentFile = vi.fn();
    const pngFile = new File([new Uint8Array([1, 2, 3])], "photo.png", {
      type: "image/png",
    });
    mockedFileOpen.mockResolvedValueOnce(pngFile);

    await render(<Excalidraw onDocumentFile={onDocumentFile} />);

    UI.clickTool("image");

    await waitFor(() => {
      expect(h.elements.length).toBe(1);
    });
    expect(h.elements[0].type).toBe("image");
    expect(onDocumentFile).not.toHaveBeenCalled();
  });

  it("without the prop, the picker offers image extensions only, and a PNG behaves as upstream", async () => {
    const pngFile = new File([new Uint8Array([1, 2, 3])], "photo.png", {
      type: "image/png",
    });
    mockedFileOpen.mockResolvedValueOnce(pngFile);

    await render(<Excalidraw />);

    UI.clickTool("image");

    await waitFor(() => {
      expect(mockedFileOpen).toHaveBeenCalledTimes(1);
    });
    const opts = mockedFileOpen.mock.calls[0][0];
    expect(opts.extensions).not.toContain("pdf");
    expect(opts.extensions).toEqual(
      expect.arrayContaining([
        "png",
        "jpg",
        "svg",
        "gif",
        "webp",
        "bmp",
        "ico",
        "avif",
        "jfif",
      ]),
    );

    await waitFor(() => {
      expect(h.elements.length).toBe(1);
    });
    expect(h.elements[0].type).toBe("image");
  });

  it("with the prop, the picker offers pdf alongside the image extensions", async () => {
    const pdfFile = new File(["%PDF-1.4"], "worksheet.pdf", {
      type: "application/pdf",
    });
    mockedFileOpen.mockResolvedValueOnce(pdfFile);

    await render(<Excalidraw onDocumentFile={vi.fn()} />);

    UI.clickTool("image");

    await waitFor(() => {
      expect(mockedFileOpen).toHaveBeenCalledTimes(1);
    });
    const opts = mockedFileOpen.mock.calls[0][0];
    expect(opts.extensions).toContain("pdf");
  });
});
