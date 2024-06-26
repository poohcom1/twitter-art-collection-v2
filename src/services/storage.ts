import {
    CACHE_UPDATE_EVENT,
    CacheUpdateEvent,
    clearCache,
    gmGetWithCache,
    gmSetWithCache,
    reloadCache,
} from './cache';
import { KEY_USER_DATA } from '../constants';
import { RawUserData, UserData, UserDataSchema } from '../models';
import { safeParse } from 'valibot';
import { dataMapper } from './dataMapper';
import { sanitizeTagName, saveFile } from '../utils';
import { createStore, reconcile } from 'solid-js/store';
import { createEffect, onCleanup } from 'solid-js';

export const DEFAULT_USER_DATA: RawUserData = {
    tags: {},
    tweets: {},
};

// Cache
if (process.env.NODE_ENV !== 'test') {
    document.addEventListener('visibilitychange', async () => {
        const userData = await gmGetWithCache<RawUserData>(KEY_USER_DATA, DEFAULT_USER_DATA);
        await clearCache(KEY_USER_DATA, DEFAULT_USER_DATA);
        await reloadCache(KEY_USER_DATA, DEFAULT_USER_DATA);

        const reloadedData = await gmGetWithCache<RawUserData>(KEY_USER_DATA, DEFAULT_USER_DATA);

        if (!dataMapper.equals(userData, reloadedData)) {
            document.dispatchEvent(
                new CustomEvent(CACHE_UPDATE_EVENT, { detail: { key: KEY_USER_DATA } })
            );
        }
    });
}

// Solidjs store

export function createUserDataStore<T extends object>(
    defVal: T,
    mapperSignal: () => (u: UserData) => T
) {
    const [viewModel, setViewModel] = createStore<T>(defVal);

    createEffect(() => {
        const mapper = mapperSignal();
        GM.getValue<RawUserData>(KEY_USER_DATA, DEFAULT_USER_DATA).then((data) => {
            setViewModel(reconcile(mapper(dataMapper.toUserData(data))));
        });

        const onCacheEvent = async (e: Event) => {
            if ((e as CacheUpdateEvent).detail.key === KEY_USER_DATA) {
                const data = await gmGetWithCache<RawUserData>(KEY_USER_DATA, DEFAULT_USER_DATA);
                setViewModel(reconcile(mapper(dataMapper.toUserData(data))));
            }
        };

        document.addEventListener(CACHE_UPDATE_EVENT, onCacheEvent);
        onCleanup(() => document.removeEventListener(CACHE_UPDATE_EVENT, onCacheEvent));
    });

    return viewModel;
}

// Setters - Tag
export async function tagExists(tagName: string): Promise<boolean> {
    const data = await gmGetWithCache<RawUserData>(KEY_USER_DATA, DEFAULT_USER_DATA);
    return dataMapper.filterExists(data.tags[sanitizeTagName(tagName)]);
}

export async function createTag(tagName: string) {
    tagName = sanitizeTagName(tagName);
    if (tagName === '') {
        console.error('Invalid tag name');
        return;
    }

    const data = await gmGetWithCache<RawUserData>(KEY_USER_DATA, DEFAULT_USER_DATA);

    if (dataMapper.filterExists(data.tags[tagName])) {
        alert('Tag already exists');
        return;
    }

    await gmSetWithCache<RawUserData>(KEY_USER_DATA, dataMapper.createTag(data, tagName));
}

export async function deleteTag(tagName: string) {
    const data = await gmGetWithCache<RawUserData>(KEY_USER_DATA, DEFAULT_USER_DATA);

    if (!(tagName in data.tags)) {
        return;
    }

    await gmSetWithCache<RawUserData>(KEY_USER_DATA, dataMapper.deleteTag(data, tagName));
}

export async function renameTag(oldTagName: string, newTagName: string) {
    oldTagName = sanitizeTagName(oldTagName);
    newTagName = sanitizeTagName(newTagName);
    if (oldTagName === '' || newTagName === '') {
        console.error('Invalid tag name');
        return;
    }
    if (oldTagName === newTagName) {
        return;
    }

    const data = await gmGetWithCache<RawUserData>(KEY_USER_DATA, DEFAULT_USER_DATA);

    if (!(oldTagName in data.tags)) {
        return;
    }

    if (dataMapper.filterExists(data.tags[newTagName])) {
        alert('Tag already exists');
        return;
    }

    await gmSetWithCache<RawUserData>(
        KEY_USER_DATA,
        dataMapper.renameTag(data, oldTagName, newTagName)
    );
}

// Setters - Tweet
export async function addTag(tweetId: string, tagName: string, imagesCache: string[]) {
    if (tweetId === null) {
        console.error('No tweet selected');
        return;
    }
    tagName = sanitizeTagName(tagName);
    if (tagName === '') {
        console.error('Invalid tag name');
        return;
    }

    const data = await gmGetWithCache<RawUserData>(KEY_USER_DATA, DEFAULT_USER_DATA);

    if (!(tweetId in data.tweets) && imagesCache.length === 0) {
        console.error('New tweet being cached, but no images found');
        return;
    }

    await gmSetWithCache<RawUserData>(
        KEY_USER_DATA,
        dataMapper.tagTweet(data, tweetId, tagName, imagesCache)
    );
}

export async function removeTag(tweetId: string, tagName: string) {
    if (tweetId === null) {
        console.error('No tweet selected');
        return;
    }
    tagName = sanitizeTagName(tagName);
    if (tagName === '') {
        console.error('Invalid tag name');
        return;
    }

    const { tags, tweets } = await gmGetWithCache<RawUserData>(KEY_USER_DATA, DEFAULT_USER_DATA);

    if (!(tagName in tags)) {
        console.error('Tag does not exist');
        return;
    }
    await gmSetWithCache<RawUserData>(
        KEY_USER_DATA,
        dataMapper.removeTag({ tags, tweets }, tweetId, tagName)
    );
}

export async function removeTweet(tweetId: string) {
    const data = await gmGetWithCache<RawUserData>(KEY_USER_DATA, DEFAULT_USER_DATA);
    await gmSetWithCache<RawUserData>(KEY_USER_DATA, dataMapper.removeTweet(data, tweetId));
}

export async function clearAllTags() {
    clearCache(KEY_USER_DATA, DEFAULT_USER_DATA);
    await GM.deleteValue(KEY_USER_DATA);
    gmSetWithCache(KEY_USER_DATA, DEFAULT_USER_DATA);
}

// Getters
export async function getRawUserData(): Promise<RawUserData> {
    return await gmGetWithCache<RawUserData>(KEY_USER_DATA, DEFAULT_USER_DATA);
}

export async function getUserData(): Promise<UserData> {
    return dataMapper.toUserData(await getRawUserData());
}

export function isDataEmpty(data: RawUserData): boolean {
    return data === DEFAULT_USER_DATA;
}

// Load/Save
export async function setImportData(jsonString: string, merge: boolean = false) {
    const data: unknown = JSON.parse(jsonString);
    const result = safeParse(UserDataSchema, data);

    if (result.success) {
        let importedData = result.output;
        if (merge) {
            const currentData: RawUserData = await gmGetWithCache<RawUserData>(
                KEY_USER_DATA,
                DEFAULT_USER_DATA
            );
            importedData = dataMapper.mergeData(currentData, result.output);
        } else {
            importedData = dataMapper.updateTimeStamps(importedData);
        }

        await gmSetWithCache(KEY_USER_DATA, importedData);
    } else {
        console.error(result.issues);
        alert(
            'Failed to import data due to potentially corrupted file. Check the console for more information.'
        );
    }
}

const exportFilename = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are zero-indexed
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    return `twitter-art-tag_data_${year}-${month}-${day}_${hours}.json`;
};

export async function exportDataToFile() {
    const tags = JSON.stringify(await getRawUserData(), null, 2);
    const blob = new Blob([tags], { type: 'application/json' });
    saveFile(blob, exportFilename());
}

export function importDataFromFile(merge: boolean): Promise<void> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.style.display = 'none';
        input.addEventListener('change', async () => {
            const file = input.files![0];
            const reader = new FileReader();
            reader.onload = async () => {
                const warning = merge
                    ? 'This will merge the data with the current data. Are you sure you want to proceed?'
                    : 'Are you sure you want to overwrite all tags?';

                const userData = await getRawUserData();

                if (!(isDataEmpty(userData) || confirm(warning))) {
                    resolve();
                    return;
                }
                await setImportData(reader.result as string, merge);

                resolve();
            };
            reader.readAsText(file);
        });
        input.click();
    });
}
