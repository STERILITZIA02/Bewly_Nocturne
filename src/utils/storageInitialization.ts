export function shouldWriteStorageDefault(
  initialReadSucceeded: boolean,
  hasStoredValue: boolean,
  dirtyBeforeReady: boolean,
  writeDefaults: boolean,
  hasValue: boolean,
) {
  return initialReadSucceeded
    && hasValue
    && (dirtyBeforeReady || (!hasStoredValue && writeDefaults))
}
