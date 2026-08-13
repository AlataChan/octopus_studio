export function resolveProviderChoice(providers, selectedValue, fallbackValue) {
  if (!Array.isArray(providers) || providers.length === 0) return null;

  return (
    providers.find((provider) => provider.value === selectedValue) ??
    providers.find((provider) => provider.value === fallbackValue) ??
    providers[0]
  );
}
