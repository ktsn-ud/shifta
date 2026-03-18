import { Input } from "@/components/ui/input";

type DatePickerProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  onValueChange?: (value: string) => void;
};

function DatePicker({ onChange, onValueChange, ...props }: DatePickerProps) {
  return (
    <Input
      type="date"
      onChange={(event) => {
        onChange?.(event);
        onValueChange?.(event.currentTarget.value);
      }}
      {...props}
    />
  );
}

export { DatePicker };
