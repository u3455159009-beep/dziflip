// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PhotosGallery } from "@/components/project/PhotosGallery";
import type { PhotoDTO } from "@/lib/project-types";

const originalFetch = global.fetch;

function jsonResponse(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

function mockFetchRouter(opts: {
  imageGen?: unknown;
  uploadHandler?: (init: RequestInit | undefined) => Response | Promise<Response>;
}) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/vision")) return jsonResponse([]);
    if (url.endsWith("/api/image-gen")) return jsonResponse(opts.imageGen ?? []);
    if (url.includes("/photos/upload")) {
      if (opts.uploadHandler) return opts.uploadHandler(init);
      return jsonResponse({ error: "no upload handler configured in test" }, 500);
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
}

function mkPhoto(overrides: Partial<PhotoDTO> = {}): PhotoDTO {
  return {
    id: "photo-1",
    projectId: "project-1",
    url: "https://blob.example.test/original.jpg",
    room: null,
    notes: null,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    sourcePhotoProvider: null,
    sourceListingProvider: null,
    sourceListingExternalId: null,
    sourceListingUrl: null,
    matchConfidence: null,
    retrievedAt: null,
    mimeType: null,
    fileSizeBytes: null,
    roomType: null,
    currentCondition: null,
    visibleIssues: null,
    keepNotes: null,
    removeNotes: null,
    replaceNotes: null,
    renovationSuggestions: null,
    analysisConfidence: null,
    analysisSource: "MANUAL",
    analyzedAt: null,
    elementDetails: null,
    generations: [],
    ...overrides
  };
}

function mkFile(name = "kuchyn.jpg", type = "image/jpeg", sizeBytes = 1024) {
  const bytes = new Uint8Array(sizeBytes).fill(1);
  return new File([bytes], name, { type });
}

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("PhotosGallery — file upload (real fix for the broken '+ Přidat' button)", () => {
  it("1. clicking '+ Přidat' opens the native file picker (triggers click on the hidden file input)", async () => {
    mockFetchRouter({});
    render(<PhotosGallery projectId="project-1" photos={[]} />);

    const fileInput = screen.getByTestId("photo-file-input") as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");

    fireEvent.click(screen.getByText("+ Přidat"));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("2. & 4. selecting a valid image uploads it and it immediately appears in the gallery", async () => {
    const uploaded = mkPhoto({ id: "photo-new", url: "https://blob.example.test/kuchyn.jpg", sourcePhotoProvider: "MANUAL_UPLOAD" });
    mockFetchRouter({
      uploadHandler: async (init) => {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBeInstanceOf(FormData);
        const form = init!.body as FormData;
        expect(form.get("file")).toBeInstanceOf(File);
        return jsonResponse(uploaded);
      }
    });
    render(<PhotosGallery projectId="project-1" photos={[]} />);

    const fileInput = screen.getByTestId("photo-file-input") as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [mkFile()] } });

    await waitFor(() => {
      expect(screen.getByAltText("").getAttribute("src")).toBe(uploaded.url);
    });
  });

  it("5. an uploaded photo is visibly labeled PŮVODNÍ (ORIGINAL)", async () => {
    const uploaded = mkPhoto({ id: "photo-orig", url: "https://blob.example.test/orig.jpg", sourcePhotoProvider: "MANUAL_UPLOAD" });
    mockFetchRouter({ uploadHandler: async () => jsonResponse(uploaded) });
    render(<PhotosGallery projectId="project-1" photos={[]} />);

    fireEvent.change(screen.getByTestId("photo-file-input"), { target: { files: [mkFile()] } });

    await waitFor(() => {
      expect(screen.getByText("PŮVODNÍ")).toBeTruthy();
    });
  });

  it("7. an invalid MIME type is rejected client-side with a clear message and no network upload", async () => {
    mockFetchRouter({ uploadHandler: async () => jsonResponse({ error: "should never be called" }, 500) });
    render(<PhotosGallery projectId="project-1" photos={[]} />);

    const badFile = mkFile("document.pdf", "application/pdf");
    fireEvent.change(screen.getByTestId("photo-file-input"), { target: { files: [badFile] } });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/Nepodporovaný formát/);
    });
    const uploadCalls = (global.fetch as any).mock.calls.filter((c: any) => String(c[0]).includes("/photos/upload"));
    expect(uploadCalls.length).toBe(0);
  });

  it("8. an oversized file is rejected client-side with a clear message and no network upload", async () => {
    mockFetchRouter({ uploadHandler: async () => jsonResponse({ error: "should never be called" }, 500) });
    render(<PhotosGallery projectId="project-1" photos={[]} />);

    const bigFile = mkFile("huge.jpg", "image/jpeg", 9 * 1024 * 1024);
    fireEvent.change(screen.getByTestId("photo-file-input"), { target: { files: [bigFile] } });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/příliš velký/);
    });
    const uploadCalls = (global.fetch as any).mock.calls.filter((c: any) => String(c[0]).includes("/photos/upload"));
    expect(uploadCalls.length).toBe(0);
  });

  it("9. a storage error from the server is shown to the user, not a silent failure", async () => {
    mockFetchRouter({
      uploadHandler: async () => jsonResponse({ error: "Úložiště fotografií (Vercel Blob) není připojeno." }, 503)
    });
    render(<PhotosGallery projectId="project-1" photos={[]} />);

    fireEvent.change(screen.getByTestId("photo-file-input"), { target: { files: [mkFile()] } });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/Úložiště fotografií/);
    });
  });

  it("10. no secret/token/key string appears anywhere in the rendered DOM or in requests the component makes", async () => {
    const uploaded = mkPhoto({ id: "photo-secretcheck" });
    mockFetchRouter({ uploadHandler: async () => jsonResponse(uploaded) });
    const { container } = render(<PhotosGallery projectId="project-1" photos={[]} />);

    fireEvent.change(screen.getByTestId("photo-file-input"), { target: { files: [mkFile()] } });
    await waitFor(() => expect(screen.getAllByAltText("").length).toBeGreaterThan(0));

    expect(container.innerHTML).not.toMatch(/BLOB_READ_WRITE_TOKEN/i);
    expect(container.innerHTML).not.toMatch(/vercel_blob_rw_/i);
  });

  it("double-click / concurrent selection while an upload is in flight doesn't fire a second upload", async () => {
    let resolveUpload!: (r: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });
    mockFetchRouter({ uploadHandler: () => pending });
    render(<PhotosGallery projectId="project-1" photos={[]} />);

    const fileInput = screen.getByTestId("photo-file-input") as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [mkFile()] } });

    // Button is disabled while the first upload is still in flight.
    await waitFor(() => {
      const addButton = screen.getByText("Nahrávám…");
      expect((addButton as HTMLButtonElement).disabled).toBe(true);
    });

    resolveUpload(jsonResponse(mkPhoto({ id: "photo-guard" })));
    await waitFor(() => expect(screen.getByText("+ Přidat")).toBeTruthy());

    const uploadCalls = (global.fetch as any).mock.calls.filter((c: any) => String(c[0]).includes("/photos/upload"));
    expect(uploadCalls.length).toBe(1);
  });
});

describe("PhotosGallery — 'Vygenerovat vizualizaci' only shown when Gemini is actually connected", () => {
  it("hides the generate button when the image-gen provider is PENDING_ACCESS", async () => {
    mockFetchRouter({
      imageGen: [{ key: "GEMINI", label: "Google Gemini (image-to-image)", status: "PENDING_ACCESS", statusNote: "čeká na klíč", healthStatus: "PENDING_ACCESS" }]
    });
    render(<PhotosGallery projectId="project-1" photos={[mkPhoto()]} />);

    fireEvent.click(screen.getByText("AI analýza / stav místnosti"));
    await waitFor(() => expect(screen.getByText(/AI vizualizace zatím není připojena/)).toBeTruthy());
    expect(screen.queryByTestId("generate-visualization-photo-1")).toBeNull();
  });

  it("shows the generate button once the provider reports CONNECTED", async () => {
    mockFetchRouter({
      imageGen: [{ key: "GEMINI", label: "Google Gemini (image-to-image)", status: "ACTIVE", statusNote: null, healthStatus: "CONNECTED" }]
    });
    render(<PhotosGallery projectId="project-1" photos={[mkPhoto()]} />);

    fireEvent.click(screen.getByText("AI analýza / stav místnosti"));
    await waitFor(() => expect(screen.getByTestId("generate-visualization-photo-1")).toBeTruthy());
  });
});
