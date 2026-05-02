import { RowDataPacket } from "mysql2";

export interface StreamerRow extends RowDataPacket {
  id: number;
}

export interface BotSettingRow extends RowDataPacket {
  setting_key: string;
  setting_value: string | null;
}

export interface BotCommandStatusRow extends RowDataPacket {
  id: number;
  status: "pending" | "processing" | "completed" | "failed";
  result_json: string | null;
  error_message: string | null;
}

export type ScenesListResult = {
  scenes: Array<{ name: string }>;
  currentProgramSceneName: string | null;
};

export type SceneItemsListResult = {
  sceneName: string;
  items: Array<{
    sceneItemId: number;
    sourceName: string;
    inputKind: string | null;
    enabled: boolean;
    transform: {
      positionX: number;
      positionY: number;
      scaleX: number;
      scaleY: number;
      rotation: number;
      width?: number;
      height?: number;
    };
  }>;
};

export type ApplySceneItemTransformInput = {
  sceneName: string;
  sceneItemId: number;
  sourceName?: string | null;
  transform: {
    positionX: number;
    positionY: number;
    scaleX: number;
    scaleY: number;
    rotation?: number;
  };
};

export type ApplySceneItemTransformResult = {
  sceneName: string;
  sceneItemId: number;
  sourceName: string | null;
  transform: {
    positionX: number;
    positionY: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    width?: number;
    height?: number;
  };
};

export type SetSceneItemIndexInput = {
  sceneName: string;
  sceneItemId: number;
  sourceName?: string | null;
  sceneItemIndex: number;
};

export type SetSceneItemIndexResult = {
  sceneName: string;
  sceneItemId: number;
  sourceName: string | null;
  sceneItemIndex: number;
  items: Array<{
    sceneItemId: number;
    sourceName: string;
    sceneItemIndex: number;
  }>;
};

export type SetSceneItemVisibilityInput = {
  sceneName: string;
  sceneItemId: number;
  sourceName?: string | null;
  enabled: boolean;
};

export type SetSceneItemVisibilityResult = {
  sceneName: string;
  sceneItemId: number;
  sourceName: string | null;
  enabled: boolean;
  items: Array<{
    sceneItemId: number;
    sourceName: string;
    sceneItemIndex: number;
    enabled?: boolean;
  }>;
};

export type RemoveSceneItemInput = {
  sceneName: string;
  sceneItemId: number;
  sourceName?: string | null;
};

export type RemoveSceneItemResult = {
  sceneName: string;
  sceneItemId: number;
  sourceName: string | null;
  removed: true;
  items: Array<{
    sceneItemId: number;
    sourceName: string;
    sceneItemIndex: number;
    enabled?: boolean;
  }>;
};

export type CreateTextSourceInput = {
  sceneName: string;
  sourceName?: string | null;
  text: string;
  positionX?: number;
  positionY?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
};

export type CreateTextSourceResult = {
  sceneName: string;
  sceneItemId: number;
  sourceName: string;
  inputKind: string;
  transform: {
    positionX: number;
    positionY: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    width?: number;
    height?: number;
  };
  items: Array<{
    sceneItemId: number;
    sourceName: string;
    sceneItemIndex: number;
  }>;
};

export type CreateBrowserSourceInput = {
  sceneName: string;
  sourceName?: string | null;
  url: string;
  width?: number;
  height?: number;
  positionX?: number;
  positionY?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
};

export type CreateBrowserSourceResult = {
  sceneName: string;
  sceneItemId: number;
  sourceName: string;
  inputKind: "browser_source";
  url: string;
  width: number;
  height: number;
  transform: {
    positionX: number;
    positionY: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    width?: number;
    height?: number;
  };
  items: Array<{
    sceneItemId: number;
    sourceName: string;
    sceneItemIndex: number;
  }>;
};

export type UpdateTextSourceInput = {
  sceneName: string;
  sceneItemId: number;
  sourceName?: string | null;
  text: string;
};

export type UpdateTextSourceResult = {
  sceneName: string;
  sceneItemId: number;
  sourceName: string;
  inputKind: string | null;
  text: string;
};

export type UpdateBrowserSourceInput = {
  sceneName: string;
  sceneItemId: number;
  sourceName?: string | null;
  url?: string;
  width?: number;
  height?: number;
};

export type UpdateBrowserSourceResult = {
  sceneName: string;
  sceneItemId: number;
  sourceName: string;
  inputKind: string;
  url?: string;
  width?: number;
  height?: number;
};

export type GetSourceSettingsInput = {
  sceneName: string;
  sceneItemId: number;
  sourceName?: string | null;
};

export type GetSourceSettingsResult = {
  sceneName: string;
  sceneItemId: number;
  sourceName: string;
  inputKind: string | null;
  settings: {
    text?: string;
    url?: string;
    width?: number;
    height?: number;
  };
};
