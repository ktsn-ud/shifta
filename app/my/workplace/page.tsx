"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { FormModal } from "@/components/modal/form-modal";
import { DataTable } from "@/components/table/data-table";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useModal } from "@/hooks/use-modal";

type WorkplaceRow = {
  id: string;
  name: string;
  type: "GENERAL" | "CRAM_SCHOOL";
};

export default function WorkplacePage() {
  const formModal = useModal(false);
  const deleteModal = useModal(false);

  const [workplaces, setWorkplaces] = useState<WorkplaceRow[]>([
    { id: "w1", name: "勤務先A", type: "GENERAL" },
    { id: "w2", name: "勤務先B", type: "CRAM_SCHOOL" },
  ]);
  const [newWorkplaceName, setNewWorkplaceName] = useState("");
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const canSave = useMemo(
    () => newWorkplaceName.trim().length > 0,
    [newWorkplaceName],
  );

  const columns = useMemo<Array<ColumnDef<WorkplaceRow>>>(
    () => [
      {
        accessorKey: "name",
        header: "勤務先名",
      },
      {
        accessorKey: "type",
        header: "種別",
      },
      {
        id: "actions",
        header: "操作",
        enableSorting: false,
        cell: ({ row }) => {
          const workplace = row.original;
          return (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingTargetId(workplace.id);
                  setNewWorkplaceName(workplace.name);
                  formModal.openModal();
                }}
              >
                編集
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDeleteTargetId(workplace.id);
                  deleteModal.openModal();
                }}
              >
                削除
              </Button>
            </div>
          );
        },
      },
    ],
    [deleteModal, formModal],
  );

  const editingTarget = useMemo(
    () => workplaces.find((item) => item.id === editingTargetId) ?? null,
    [editingTargetId, workplaces],
  );

  return (
    <section className="p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Workplace Management</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            T4-4 DataTable 確認用の簡易画面です。
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditingTargetId(null);
            setNewWorkplaceName("");
            formModal.openModal();
          }}
        >
          勤務先を追加
        </Button>
      </div>

      <div className="mt-6">
        <DataTable
          columns={columns}
          data={workplaces}
          filterPlaceholder="勤務先名で検索"
          emptyMessage="勤務先がありません"
        />
      </div>

      <FormModal
        open={formModal.open}
        onOpenChange={formModal.setOpen}
        title={editingTarget ? "勤務先を編集" : "勤務先を追加"}
        description="保存時にモーダルは自動クローズします。"
        submitLabel={editingTarget ? "更新" : "追加"}
        onSubmit={() => {
          if (!canSave) {
            return;
          }

          if (editingTargetId) {
            setWorkplaces((prev) =>
              prev.map((item) =>
                item.id === editingTargetId
                  ? { ...item, name: newWorkplaceName.trim() }
                  : item,
              ),
            );
            return;
          }

          const nextId = String(Date.now());
          setWorkplaces((prev) => [
            ...prev,
            { id: nextId, name: newWorkplaceName.trim(), type: "GENERAL" },
          ]);
          setNewWorkplaceName("");
        }}
      >
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="workplaceName">勤務先名</FieldLabel>
            <FieldContent>
              <Input
                id="workplaceName"
                value={newWorkplaceName}
                onChange={(event) =>
                  setNewWorkplaceName(event.currentTarget.value)
                }
              />
              <FieldDescription>1文字以上で登録できます。</FieldDescription>
            </FieldContent>
          </Field>
        </div>
      </FormModal>

      <ConfirmDialog
        open={deleteModal.open}
        onOpenChange={deleteModal.setOpen}
        title="勤務先を削除しますか？"
        description="この操作は取り消せません。"
        onConfirm={() => {
          if (!deleteTargetId) {
            return;
          }

          setWorkplaces((prev) =>
            prev.filter((item) => item.id !== deleteTargetId),
          );
          setDeleteTargetId(null);
        }}
      />
    </section>
  );
}
