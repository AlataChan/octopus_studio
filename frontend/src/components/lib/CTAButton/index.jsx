import Button from "@/components/Button";

export default function CTAButton({
  children,
  disabled = false,
  onClick,
  className = "",
  type = "button",
  ...rest
}) {
  return (
    <Button
      className={`w-fit whitespace-nowrap ${className}`}
      disabled={disabled}
      onClick={onClick}
      size="sm"
      type={type}
      variant="primary"
      {...rest}
    >
      {children}
    </Button>
  );
}
