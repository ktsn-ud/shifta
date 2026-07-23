import { FieldError } from "@/components/ui/form";

type FormErrorMessageProps = {
  id?: string;
  message?: string;
};

export function FormErrorMessage({ id, message }: FormErrorMessageProps) {
  if (!message) {
    return null;
  }

  return <FieldError id={id}>{message}</FieldError>;
}
