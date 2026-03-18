import { FieldError } from "@/components/ui/form";

type FormErrorMessageProps = {
  message?: string;
};

export function FormErrorMessage({ message }: FormErrorMessageProps) {
  if (!message) {
    return null;
  }

  return <FieldError>{message}</FieldError>;
}
