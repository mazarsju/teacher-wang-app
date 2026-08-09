import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminPage from "./AdminPage";
import * as adminApi from "../utils/admin/adminApi";

vi.mock("../utils/admin/adminApi", () => ({
  fetchUsers: vi.fn(),
  updateUserPlan: vi.fn(),
}));

const fetchUsers = vi.mocked(adminApi.fetchUsers);
const updateUserPlan = vi.mocked(adminApi.updateUserPlan);

describe("AdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists users with their plan", async () => {
    fetchUsers.mockResolvedValue([
      {
        id: "1",
        email: "a@example.com",
        plan: "free",
        last_connection: "2026-01-01T00:00:00Z",
      },
      {
        id: "2",
        email: "b@example.com",
        plan: "pro",
        last_connection: "2026-02-02T00:00:00Z",
      },
    ]);

    render(<AdminPage />);

    expect(await screen.findByText("a@example.com")).toBeInTheDocument();
    expect(screen.getByText("b@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Plan for a@example.com")).toHaveValue("free");
    expect(screen.getByLabelText("Plan for b@example.com")).toHaveValue("pro");
  });

  it("upgrades a user's plan and reflects the response", async () => {
    const user = userEvent.setup();
    fetchUsers.mockResolvedValue([
      {
        id: "1",
        email: "a@example.com",
        plan: "free",
        last_connection: "2026-01-01T00:00:00Z",
      },
    ]);
    updateUserPlan.mockResolvedValue({
      id: "1",
      email: "a@example.com",
      plan: "pro",
      last_connection: "2026-01-01T00:00:00Z",
    });

    render(<AdminPage />);

    await screen.findByText("a@example.com");
    await user.selectOptions(
      screen.getByLabelText("Plan for a@example.com"),
      "pro",
    );

    await waitFor(() => {
      expect(updateUserPlan).toHaveBeenCalledWith("1", "pro");
    });
    expect(screen.getByLabelText("Plan for a@example.com")).toHaveValue("pro");
  });

  it("shows an error when loading users fails", async () => {
    fetchUsers.mockRejectedValue(new Error("Failed to load users."));

    render(<AdminPage />);

    expect(await screen.findByText("Failed to load users.")).toBeInTheDocument();
  });
});
