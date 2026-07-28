import { render } from "@testing-library/react";
import {
  ChatBubbleIcon,
  EyeIcon,
  HouseIcon,
  InfoIcon,
  NotebookIcon,
  PenIcon,
  SettingsIcon,
  SyncIcon,
  TrophyIcon,
  ExportIcon,
  ImportIcon,
  TrashIcon,
  CloseIcon,
  WarningIcon,
} from "./icons";

describe("icons", () => {
  it.each([
    ["HouseIcon", HouseIcon],
    ["NotebookIcon", NotebookIcon],
    ["ChatBubbleIcon", ChatBubbleIcon],
    ["SettingsIcon", SettingsIcon],
    ["SyncIcon", SyncIcon],
    ["PenIcon", PenIcon],
    ["EyeIcon", EyeIcon],
    ["TrophyIcon", TrophyIcon],
    ["InfoIcon", InfoIcon],
    ["ExportIcon", ExportIcon],
    ["ImportIcon", ImportIcon],
    ["TrashIcon", TrashIcon],
    ["CloseIcon", CloseIcon],
    ["WarningIcon", WarningIcon],
  ])("renders %s as an accessible decorative svg", (_name, Icon) => {
    const { container } = render(<Icon className="navbar-icon" />);

    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass("navbar-icon");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
