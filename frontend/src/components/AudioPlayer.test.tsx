import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AudioPlayer from "./AudioPlayer";

describe("AudioPlayer", () => {
  beforeEach(() => {
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(
      undefined,
    );
    vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(
      () => {},
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and plays the audio on first click, then toggles to pause", async () => {
    const user = userEvent.setup();
    const loadAudio = vi
      .fn()
      .mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));

    render(<AudioPlayer loadAudio={loadAudio} />);

    await user.click(screen.getByRole("button", { name: "Play" }));

    expect(loadAudio).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", { name: "Pause" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(
      await screen.findByRole("button", { name: "Play" }),
    ).toBeInTheDocument();

    // Re-playing reuses the already-loaded blob instead of fetching again.
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(loadAudio).toHaveBeenCalledTimes(1);
  });

  it("shows skip buttons only when showSkipButtons is set", () => {
    const { rerender } = render(
      <AudioPlayer loadAudio={vi.fn()} showSkipButtons={false} />,
    );

    expect(
      screen.queryByRole("button", { name: "Go back 5 seconds" }),
    ).not.toBeInTheDocument();

    rerender(<AudioPlayer loadAudio={vi.fn()} showSkipButtons />);

    expect(
      screen.getByRole("button", { name: "Go back 5 seconds" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Go forward 5 seconds" }),
    ).toBeInTheDocument();
  });

  it("shows an error when loading the audio fails", async () => {
    const user = userEvent.setup();
    const loadAudio = vi.fn().mockRejectedValue(new Error("network error"));

    render(<AudioPlayer loadAudio={loadAudio} />);
    await user.click(screen.getByRole("button", { name: "Play" }));

    expect(
      await screen.findByText("Failed to load the audio."),
    ).toBeInTheDocument();
  });
});
