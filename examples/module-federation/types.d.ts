declare module '*.svg' {
  import { SvgProps } from 'react-native-svg';
  const content: React.FC<SvgProps>;
  export default content;
}

declare module 'remote_app/RemoteNavigator' {
  import { ComponentType } from 'react';
  const RemoteNavigator: ComponentType;
  export default RemoteNavigator;
}
