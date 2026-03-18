"use client";

import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { FormModal } from "@/components/modal/form-modal";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useModal } from "@/hooks/use-modal";

export default function WorkplacePage() {
  const createModal = useModal(false);
  const deleteModal = useModal(false);

  const [workplaces, setWorkplaces] = useState<string[]>([
    "勤務先A",
    "勤務先B",
  ]);
  const [newWorkplaceName, setNewWorkplaceName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const canCreate = useMemo(
    () => newWorkplaceName.trim().length > 0,
    [newWorkplaceName],
  );

  return (
    <section className="p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Workplace Management</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            T4-3 モーダルコンポーネント確認用の簡易画面です。
          </p>
        </div>
        <Button type="button" onClick={createModal.openModal}>
          勤務先を追加
        </Button>
      </div>

      <ul className="mt-6 flex max-w-xl flex-col gap-2">
        {workplaces.map((name) => (
          <li
            key={name}
            className="flex items-center justify-between rounded-md border px-3 py-2"
          >
            <span className="text-sm">{name}</span>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setDeleteTarget(name);
                deleteModal.openModal();
              }}
            >
              削除
            </Button>
          </li>
        ))}
      </ul>

      <FormModal
        open={createModal.open}
        onOpenChange={createModal.setOpen}
        title="勤務先を追加"
        description="保存時にモーダルは自動クローズします。"
        submitLabel="追加"
        onSubmit={() => {
          if (!canCreate) {
            return;
          }

          setWorkplaces((prev) => [...prev, newWorkplaceName.trim()]);
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
          if (!deleteTarget) {
            return;
          }

          setWorkplaces((prev) => prev.filter((name) => name !== deleteTarget));
          setDeleteTarget(null);
        }}
      />
    </section>
  );
}
