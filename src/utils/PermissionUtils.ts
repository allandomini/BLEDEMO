import { PermissionsAndroid, Platform } from 'react-native';

export const requestBluetoothPermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return true; // On iOS, permissions are handled differently
  }

  if (Platform.Version < 23) {
    return true; // No runtime permissions needed before Android 6.0
  }

  try {
    const permissions = [
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ];

    // Add Android 12+ permissions
    if (Platform.Version >= 31) {
      permissions.push(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      );
    }

    const granted = await PermissionsAndroid.requestMultiple(permissions);
    
    // Check if all permissions were granted
    const allGranted = Object.values(granted).every(
      status => status === PermissionsAndroid.RESULTS.GRANTED
    );

    return allGranted;
  } catch (err) {
    console.warn('Error requesting permissions:', err);
    return false;
  }
};
