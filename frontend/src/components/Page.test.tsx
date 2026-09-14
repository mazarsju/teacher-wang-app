import { render, screen } from "@testing-library/react";
import Page from "./Page";

describe("Page", () => {
  it("renders the title and children", () => {
    render(
      <Page title="Knowledge base">
        <p>Table content</p>
      </Page>,
    );

    expect(
      screen.getByRole("heading", { name: "Knowledge base" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Table content")).toBeInTheDocument();
  });

  it("renders an optional header action", () => {
    render(
      <Page title="Knowledge base" headerAction={<button>Add character</button>}>
        <p>Table content</p>
      </Page>,
    );

    expect(
      screen.getByRole("button", { name: "Add character" }),
    ).toBeInTheDocument();
  });

  it("renders an optional subtitle next to the title", () => {
    render(
      <Page title="Knowledge base" subtitle="Displaying all characters">
        <p>Table content</p>
      </Page>,
    );

    expect(screen.getByText("Displaying all characters")).toBeInTheDocument();
  });
});
