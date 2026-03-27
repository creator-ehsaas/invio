import { Composition } from "remotion";
import { InvioDemo } from "./InvioDemo";

export const RemotionRoot = () => {
  return (
    <Composition
      id="InvioDemo"
      component={InvioDemo}
      durationInFrames={660} // ~22 seconds at 30fps
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
