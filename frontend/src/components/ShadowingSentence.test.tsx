import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShadowingSentence from "./ShadowingSentence";
import * as listeningApi from "../utils/listening/listeningApi";

vi.mock("../utils/listening/listeningApi", () => ({
  transcribeListeningAudio: vi.fn(),
}));

const transcribeListeningAudio = vi.mocked(listeningApi.transcribeListeningAudio);

const mandarin = "你家有几个人？";
const loadAudio = () => Promise.resolve(new Blob(["audio"], { type: "audio/mpeg" }));

describe("ShadowingSentence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the speaker image before the audio player when given one", () => {
    render(
      <ShadowingSentence
        mandarin={mandarin}
        loadAudio={loadAudio}
        speakerImage="/man.png"
        speakerAlt="Man speaker"
      />,
    );

    expect(screen.getByAltText("Man speaker")).toHaveAttribute(
      "src",
      "/man.png",
    );
  });

  it("does not render a speaker image when none is given", () => {
    render(<ShadowingSentence mandarin={mandarin} loadAudio={loadAudio} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("blurs the sentence until revealed", async () => {
    const user = userEvent.setup();
    render(<ShadowingSentence mandarin={mandarin} loadAudio={loadAudio} />);

    const text = screen.getByText("你家有几个人？");
    expect(text.className).toMatch(/blurred/i);

    await user.click(screen.getByRole("button", { name: "Show the sentence" }));
    expect(text.className).not.toMatch(/blurred/i);
  });

  it("shows a result icon after checking a correct typed answer", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ShadowingSentence mandarin={mandarin} loadAudio={loadAudio} />,
    );

    const svgCountBefore = container.querySelectorAll("svg").length;
    await user.type(
      screen.getByPlaceholderText("Type or record what you hear..."),
      "你家有几个人",
    );
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(container.querySelectorAll("svg").length).toBe(svgCountBefore + 1);
  });

  it("clears the result icon when the input changes again", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ShadowingSentence mandarin={mandarin} loadAudio={loadAudio} />,
    );

    const input = screen.getByPlaceholderText("Type or record what you hear...");
    const svgCountBefore = container.querySelectorAll("svg").length;
    await user.type(input, "wrong answer");
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(container.querySelectorAll("svg").length).toBe(svgCountBefore + 1);

    await user.type(input, "!");
    expect(container.querySelectorAll("svg").length).toBe(svgCountBefore);
  });

  it("records voice input and fills the input with the transcript", async () => {
    const fakeStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    const getUserMediaMock = vi.fn().mockResolvedValue(fakeStream);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: getUserMediaMock },
      configurable: true,
    });

    class FakeMediaRecorder {
      state = "recording";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        // no-op: the fake recorder emits its chunk on stop()
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["chunk"]) });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    transcribeListeningAudio.mockResolvedValue("你家有几个人");

    render(<ShadowingSentence mandarin={mandarin} loadAudio={loadAudio} />);

    const recordButton = screen.getByRole("button", { name: "Hold to record" });
    fireEvent.mouseDown(recordButton);
    await waitFor(() => expect(getUserMediaMock).toHaveBeenCalled());

    fireEvent.mouseUp(recordButton);

    await waitFor(() =>
      expect(
        screen.getByPlaceholderText("Type or record what you hear..."),
      ).toHaveValue("你家有几个人"),
    );

    vi.unstubAllGlobals();
  });

  it("appends the transcript to text already typed in the input", async () => {
    const user = userEvent.setup();
    const fakeStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    const getUserMediaMock = vi.fn().mockResolvedValue(fakeStream);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: getUserMediaMock },
      configurable: true,
    });

    class FakeMediaRecorder {
      state = "recording";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        // no-op: the fake recorder emits its chunk on stop()
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["chunk"]) });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    transcribeListeningAudio.mockResolvedValue("几个人");

    render(<ShadowingSentence mandarin={mandarin} loadAudio={loadAudio} />);

    const input = screen.getByPlaceholderText("Type or record what you hear...");
    await user.type(input, "你家有");

    const recordButton = screen.getByRole("button", { name: "Hold to record" });
    fireEvent.mouseDown(recordButton);
    await waitFor(() => expect(getUserMediaMock).toHaveBeenCalled());

    fireEvent.mouseUp(recordButton);

    await waitFor(() => expect(input).toHaveValue("你家有几个人"));

    vi.unstubAllGlobals();
  });
});
