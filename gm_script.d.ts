type GMGlobal = {
    setValue: (key: string, value: any) => Promise<void>;
    getValue: (key: string, defaultValue: any) => Promise<any>;
    deleteValue: (key: string) => Promise<void>;
    listValues: () => Promise<string[]>;
    registerMenuCommand(caption: string, commandFunc: () => void, accessKey?: string): void;
};

declare var GM: GMGlobal;

type Tag = {
    tweets: string[];
    lastUpdated: number;
};

type Tags = Record<string, Tag | undefined>;

type Tweet = {
    images: string[];
};

type Tweets = Record<string, Tweet | undefined>;
