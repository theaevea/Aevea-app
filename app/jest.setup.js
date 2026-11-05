// Native modules are never loaded in unit tests; screens use MockTransport.
jest.mock('react-native-ble-plx', () => ({
  BleManager: class {},
  State: {},
}));
