declare module '*/LogBox' {
  const LogBox: { clearAllLogs: () => void };

  export default LogBox;
}

declare module '*/NativeRedBox' {
  const NativeRedBox: { dismiss?: () => void };

  export default NativeRedBox;
}

declare module '*/DevLoadingView' {
  const DevLoadingView: {
    showMessage: (message: string, type: string, options?: { dismissButton?: boolean }) => void;
    hide: () => void;
  };

  export default DevLoadingView;
}

declare module '*/Platform' {
  const Platform: { OS: string };

  export default Platform;
}
