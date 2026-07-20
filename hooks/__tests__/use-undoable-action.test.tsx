import { act, renderHook } from "@testing-library/react";
import type { MouseEvent } from "react";
import { type Action, type ExternalToast, toast } from "sonner";
import { useUndoableAction } from "@/hooks/use-undoable-action";

const toastMock = toast as jest.MockedFunction<typeof toast>;

jest.mock("sonner", () => ({
  toast: Object.assign(
    jest.fn(() => "undo-toast-1"),
    {
      dismiss: jest.fn(),
    },
  ),
}));

describe("useUndoableAction", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    toastMock.mockClear();
    (toast.dismiss as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("defers commit for four seconds and exposes an Undo toast action", () => {
    const onCommit = jest.fn();
    const onUndo = jest.fn();
    const { result } = renderHook(() => useUndoableAction());

    act(() => {
      result.current.schedule({
        id: "shift-1",
        message: "シフトを削除予定にしました。",
        onCommit,
        onUndo,
      });
    });

    expect(onCommit).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith("シフトを削除予定にしました。", {
      duration: 4000,
      action: expect.objectContaining({ label: "元に戻す" }),
    });

    act(() => {
      jest.advanceTimersByTime(3999);
    });
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("cancels the pending commit and restores state when Undo is clicked", () => {
    const onCommit = jest.fn();
    const onUndo = jest.fn();
    const { result } = renderHook(() => useUndoableAction());

    act(() => {
      result.current.schedule({
        id: "shift-1",
        message: "シフトを削除予定にしました。",
        onCommit,
        onUndo,
      });
    });

    const options = toastMock.mock.calls[0]?.[1] as ExternalToast;
    const action = options.action as Action;
    act(() => {
      action.onClick({} as MouseEvent<HTMLButtonElement>);
      jest.advanceTimersByTime(4000);
    });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(toast.dismiss).toHaveBeenCalledWith("undo-toast-1");
  });

  it("unmount rolls back only actions that are still pending", () => {
    const pendingCommit = jest.fn();
    const pendingUndo = jest.fn();
    const { result, unmount } = renderHook(() => useUndoableAction());

    act(() => {
      result.current.schedule({
        id: "pending-shift",
        message: "シフトを削除予定にしました。",
        onCommit: pendingCommit,
        onUndo: pendingUndo,
      });
    });

    unmount();

    expect(pendingUndo).toHaveBeenCalledTimes(1);
    expect(pendingCommit).not.toHaveBeenCalled();

    const committedUndo = jest.fn();
    const { result: committedResult, unmount: unmountCommitted } = renderHook(
      () => useUndoableAction(),
    );
    act(() => {
      committedResult.current.schedule({
        id: "committed-shift",
        message: "シフトを削除予定にしました。",
        onCommit: jest.fn(),
        onUndo: committedUndo,
      });
      jest.advanceTimersByTime(4000);
    });

    unmountCommitted();
    expect(committedUndo).not.toHaveBeenCalled();

    const undoneUndo = jest.fn();
    const { result: undoneResult, unmount: unmountUndone } = renderHook(() =>
      useUndoableAction(),
    );
    act(() => {
      undoneResult.current.schedule({
        id: "undone-shift",
        message: "シフトを削除予定にしました。",
        onCommit: jest.fn(),
        onUndo: undoneUndo,
      });
    });

    const options = toastMock.mock.calls[2]?.[1] as ExternalToast;
    const action = options.action as Action;
    act(() => {
      action.onClick({} as MouseEvent<HTMLButtonElement>);
    });

    unmountUndone();
    expect(undoneUndo).toHaveBeenCalledTimes(1);
  });
});
