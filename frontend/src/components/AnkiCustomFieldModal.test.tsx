import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnkiCustomFieldModal from "./AnkiCustomFieldModal";

describe("AnkiCustomFieldModal", () => {
  it("renders nothing when closed", () => {
    render(
      <AnkiCustomFieldModal isOpen={false} onConfirm={() => {}} onCancel={() => {}} />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("disables confirm until a title is entered, then submits title and description", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <AnkiCustomFieldModal isOpen onConfirm={onConfirm} onCancel={() => {}} />,
    );

    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();

    await user.type(screen.getByLabelText("Title"), "  Example sentence  ");
    await user.type(screen.getByLabelText("Description"), "shown on the back");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onConfirm).toHaveBeenCalledWith("Example sentence", "shown on the back");
  });

  it("resets its fields each time it reopens", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AnkiCustomFieldModal isOpen onConfirm={() => {}} onCancel={() => {}} />,
    );

    await user.type(screen.getByLabelText("Title"), "Notes");
    rerender(
      <AnkiCustomFieldModal isOpen={false} onConfirm={() => {}} onCancel={() => {}} />,
    );
    rerender(
      <AnkiCustomFieldModal isOpen onConfirm={() => {}} onCancel={() => {}} />,
    );

    expect(screen.getByLabelText("Title")).toHaveValue("");
  });

  it("calls onCancel when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <AnkiCustomFieldModal isOpen onConfirm={() => {}} onCancel={onCancel} />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
