import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VoiceInputButton from "./VoiceInputButton";

class FakeMediaRecorder {
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    // no-op: the fake recorder emits its chunk on stop()
  }
  stop() {
    this.ondataavailable?.({ data: new Blob(["chunk"]) });
    this.onstop?.();
  }
}

function stubRecording(transcript: string) {
  const fakeStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  const getUserMediaMock = vi.fn().mockResolvedValue(fakeStream);
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: getUserMediaMock },
    configurable: true,
  });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo) =>
      String(input).endsWith("/chat/stt")
        ? Promise.resolve({ ok: true, json: async () => ({ text: transcript }) })
        : Promise.resolve({ ok: false, json: async () => ({}) }),
    ),
  );
  return getUserMediaMock;
}

function Harness({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return (
    <div>
      <input value={value} onChange={(event) => setValue(event.target.value)} />
      <VoiceInputButton value={value} onChange={setValue} />
    </div>
  );
}

describe("VoiceInputButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("appends the transcript to the current field value", async () => {
    const getUserMediaMock = stubRecording("hello");
    render(<Harness initialValue="existing " />);

    const button = screen.getByRole("button", { name: "Hold to record your voice" });
    fireEvent.mouseDown(button);
    await waitFor(() => expect(getUserMediaMock).toHaveBeenCalled());
    fireEvent.mouseUp(button);

    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("existing hello"));
  });
});
