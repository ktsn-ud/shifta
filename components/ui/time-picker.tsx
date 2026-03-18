import { Input } from "@/components/ui/input";

type TimePickerProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  onValueChange?: (value: string) => void;
};

function TimePicker({ onChange, onValueChange, ...props }: TimePickerProps) {
  return (
    <Input
      type="time"
      onChange={(event) => {
        onChange?.(event);
        onValueChange?.(event.currentTarget.value);
      }}
      {...props}
    />
  );
}

export { TimePicker };
