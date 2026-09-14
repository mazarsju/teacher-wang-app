import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Table from "./Table";

type Row = {
  id: string;
  name: string;
};

const columns = [{ key: "name" as const, header: "name" }];

describe("Table", () => {
  it("renders rows and column headers", () => {
    render(
      <Table<Row>
        columns={columns}
        rows={[{ id: "1", name: "Alice" }]}
        getRowKey={(row) => row.id}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "name" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Alice" })).toBeInTheDocument();
  });

  it("renders the empty message when there are no rows", () => {
    render(
      <Table<Row>
        columns={columns}
        rows={[]}
        getRowKey={(row) => row.id}
        emptyMessage="No characters in the database yet."
      />,
    );

    expect(
      screen.getByText("No characters in the database yet."),
    ).toBeInTheDocument();
  });

  it("renders row actions when provided", () => {
    render(
      <Table<Row>
        columns={columns}
        rows={[{ id: "1", name: "Alice" }]}
        getRowKey={(row) => row.id}
        renderRowActions={() => <button>Edit</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("calls onRowClick with the row when a row is clicked", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();

    render(
      <Table<Row>
        columns={columns}
        rows={[{ id: "1", name: "Alice" }]}
        getRowKey={(row) => row.id}
        onRowClick={onRowClick}
      />,
    );

    await user.click(screen.getByRole("cell", { name: "Alice" }));

    expect(onRowClick).toHaveBeenCalledWith({ id: "1", name: "Alice" });
  });

  it("applies compact and scrollable classes when configured", () => {
    const { container } = render(
      <Table<Row>
        columns={columns}
        rows={[{ id: "1", name: "Alice" }]}
        getRowKey={(row) => row.id}
        compact
        maxVisibleRows={5}
      />,
    );

    expect(container.querySelector(".table-wrapper--compact")).toBeInTheDocument();
    expect(container.querySelector(".table-wrapper--scrollable")).toBeInTheDocument();
    expect(container.querySelector(".table--compact")).toBeInTheDocument();
  });
});
