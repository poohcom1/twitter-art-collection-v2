import { clearCache, gmGetWithCache, gmSetWithCache, reloadCache } from './cache';
import { CUSTOM_PAGE_PATH, KEY_USER_DATA } from '../constants';
import { UserDataSchema, WithMetadata, Tweet, Tweets, UserData, Tag, Tags } from '../models';
import { safeParse } from 'valibot';

const DEFAULT_USER_DATA: UserData = {
    tags: {},
    tweets: {},
};

// Cache
export const cacheInvalidated = new Event('cacheInvalidated');
if (process.env.NODE_ENV !== 'test') {
    document.addEventListener('visibilitychange', () => {
        clearCache(KEY_USER_DATA);
        reloadCache(KEY_USER_DATA).then(() => document.dispatchEvent(cacheInvalidated));
    });
}

// Sanitize
function sanitizeTagName(tagName: string) {
    return tagName.trim().toLowerCase();
}

function stripQueryParameters(url: string) {
    const urlObj = new URL(url);
    const searchParams = urlObj.searchParams;
    searchParams.delete('name');
    urlObj.search = searchParams.toString();
    return urlObj.toString();
}

// Tag
export async function createTag(tagName: string) {
    tagName = sanitizeTagName(tagName);
    if (tagName === '') {
        console.error('Invalid tag name');
        return;
    }

    const { tags, tweets } = await gmGetWithCache<UserData>(KEY_USER_DATA, DEFAULT_USER_DATA);

    if (tagExists(tags, tagName)) {
        alert('Tag already exists');
        return;
    }

    tags[tagName] = {
        tweets: [],
        modifiedAt: Date.now(),
        deletedAt: 0,
        tweetsModifiedAt: {},
    };

    await gmSetWithCache<UserData>(KEY_USER_DATA, { tags, tweets });
}

export async function deleteTag(tagName: string) {
    const { tags, tweets } = await gmGetWithCache<UserData>(KEY_USER_DATA, DEFAULT_USER_DATA);

    if (!(tagName in tags)) {
        return;
    }

    tags[tagName].deletedAt = Date.now();
    await gmSetWithCache<UserData>(KEY_USER_DATA, { tags, tweets });
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

    const { tags, tweets } = await gmGetWithCache<UserData>(KEY_USER_DATA, DEFAULT_USER_DATA);

    if (!(oldTagName in tags)) {
        return;
    }

    if (tagExists(tags, newTagName)) {
        alert('Tag already exists');
        return;
    }

    tags[oldTagName].deletedAt = Date.now();
    tags[newTagName] = tags[oldTagName];
    tags[newTagName].modifiedAt = Date.now();
    for (const tweetId of tags[newTagName].tweets) {
        tags[newTagName].tweetsModifiedAt = tags[newTagName].tweetsModifiedAt ?? {};
        tags[newTagName].tweetsModifiedAt![tweetId] = Date.now();
    }

    await gmSetWithCache<UserData>(KEY_USER_DATA, { tags, tweets });
}

// Tweet
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

    const { tags, tweets } = await gmGetWithCache<UserData>(KEY_USER_DATA, DEFAULT_USER_DATA);

    if (!(tweetId in tweets) && imagesCache.length === 0) {
        console.error('New tweet being cached, but no images found');
        return;
    }

    let tag: Tag = {
        tweets: [],
        modifiedAt: Date.now(),
        deletedAt: 0,
        tweetsModifiedAt: {},
    };

    if (tagName in tags) {
        tag = tags[tagName];
    } else {
        tags[tagName] = tag;
    }

    tag.modifiedAt = Date.now();
    tag.tweetsModifiedAt[tweetId] = Date.now();

    if (!tag.tweets.includes(tweetId)) {
        tag.tweets.push(tweetId);
    }

    if (imagesCache.length > 0) {
        tweets[tweetId] = {
            images: imagesCache.map(stripQueryParameters),
            modifiedAt: Date.now(),
            deletedAt: 0,
        };
    }
    tweets[tweetId].modifiedAt = Date.now();

    await gmSetWithCache<UserData>(KEY_USER_DATA, { tags, tweets });
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

    const { tags, tweets } = await gmGetWithCache<UserData>(KEY_USER_DATA, DEFAULT_USER_DATA);

    if (!(tagName in tags)) {
        return;
    }

    tags[tagName].tweets = tags[tagName].tweets.filter((id) => id !== tweetId);
    tags[tagName].modifiedAt = Date.now();
    tags[tagName].tweetsModifiedAt[tweetId] = Date.now();
    tags[tagName].tweets.forEach((id) => {
        tweets[id].modifiedAt = Date.now();
    });

    await gmSetWithCache<UserData>(KEY_USER_DATA, { tags, tweets });
}

export async function removeTweet(tweetId: string) {
    const { tags, tweets } = await gmGetWithCache<UserData>(KEY_USER_DATA, DEFAULT_USER_DATA);

    for (const tag of Object.values(tags)) {
        tag.tweets = tag.tweets.filter((id) => id !== tweetId);
    }

    tweets[tweetId].deletedAt = Date.now();

    await gmSetWithCache<UserData>(KEY_USER_DATA, { tags, tweets });
}

// Get data
function filterExists(data: WithMetadata): boolean {
    return data.modifiedAt >= data.deletedAt;
}

export async function getTags(): Promise<Tags> {
    return gmGetWithCache<UserData>(KEY_USER_DATA, DEFAULT_USER_DATA).then(({ tags }) => {
        const filteredTags: Tags = {};
        for (const [tagName, tag] of Object.entries<Tag>(tags)) {
            if (filterExists(tag)) {
                filteredTags[tagName] = tag;
            }
        }
        return filteredTags;
    });
}

export async function getTweets(): Promise<Tweets> {
    return gmGetWithCache<UserData>(KEY_USER_DATA, DEFAULT_USER_DATA).then(({ tweets }) => {
        const filteredTweets: Tweets = {};
        for (const [tweetId, tweet] of Object.entries<Tweet>(tweets)) {
            if (filterExists(tweet)) {
                filteredTweets[tweetId] = tweet;
            }
        }
        return filteredTweets;
    });
}

// Store
export async function getExportData(): Promise<UserData> {
    return await gmGetWithCache<UserData>(KEY_USER_DATA, DEFAULT_USER_DATA);
}

export async function setImportData(jsonString: string, merge: boolean = false) {
    const data: unknown = JSON.parse(jsonString);
    const result = safeParse(UserDataSchema, data);

    if (result.success) {
        let importedData = result.output;
        if (merge) {
            const currentData: UserData = await gmGetWithCache<UserData>(
                KEY_USER_DATA,
                DEFAULT_USER_DATA
            );
            importedData = mergeData(currentData, result.output);
        } else {
            // Update modifiedAt and deletedAt
            const { tags, tweets } = importedData;

            const now = Date.now();
            for (const tag of Object.keys(importedData.tags)) {
                if (tagExists(tags, tag)) {
                    tags[tag].modifiedAt = now;
                } else {
                    tags[tag].deletedAt = now;
                }

                for (const tweet of tags[tag].tweets) {
                    tweets[tweet].modifiedAt = now;
                }
            }

            for (const tweet of Object.keys(importedData.tweets)) {
                if (filterExists(tweets[tweet])) {
                    tweets[tweet].modifiedAt = now;
                } else {
                    tweets[tweet].deletedAt = now;
                }
            }
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
    const tags = JSON.stringify(await getExportData(), null, 2);
    const blob = new Blob([tags], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    a.download = exportFilename();
    a.click();
    URL.revokeObjectURL(url);
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
                if (!merge) {
                    if (!confirm('Are you sure you want to overwrite all tags?')) {
                        return;
                    }
                }
                await setImportData(reader.result as string, merge);

                resolve();
            };
            reader.readAsText(file);
        });
        input.click();
    });
}

export async function clearAllTags() {
    if (!confirm('Are you sure you want to delete all tags?')) {
        return;
    }
    clearCache(KEY_USER_DATA);
    GM.deleteValue(KEY_USER_DATA);

    if (window.location.href.includes(CUSTOM_PAGE_PATH)) {
        window.location.reload();
    }
}

// Sync
function tagExists(tags: Tags, tagName: string) {
    return tagName in tags && (tags[tagName].modifiedAt ?? 0) >= (tags[tagName].deletedAt ?? 0);
}

export function mergeData(data1: UserData, data2: UserData): UserData {
    const merged: UserData = {
        tags: {},
        tweets: {},
    };

    // Tags
    const tags1AndShared = Object.keys(data1.tags);
    const tags2 = Object.keys(data2.tags).filter((tag) => !tags1AndShared.includes(tag));

    // - Shared and unique to data1
    for (const tag of tags1AndShared) {
        if (!Object.keys(data2.tags).includes(tag)) {
            merged.tags[tag] = data1.tags[tag];
            continue;
        }

        // Shared
        const tag1 = data1.tags[tag];
        const tag2 = data2.tags[tag];

        const mergedTweets = [...new Set([...tag1.tweets, ...tag2.tweets])];
        const tweets: string[] = [];
        const mergedTweetsModifiedAt: Record<string, number> = {};

        for (const tweet of mergedTweets) {
            const modifiedAt1 = tag1.tweetsModifiedAt?.[tweet] ?? 0;
            const modifiedAt2 = tag2.tweetsModifiedAt?.[tweet] ?? 0;

            if (modifiedAt1 > modifiedAt2 && !tag1.tweets.includes(tweet)) {
                continue;
            } else if (modifiedAt2 > modifiedAt1 && !tag2.tweets.includes(tweet)) {
                continue;
            }

            tweets.push(tweet);
            mergedTweetsModifiedAt[tweet] = Math.max(modifiedAt1, modifiedAt2);
        }

        merged.tags[tag] = {
            modifiedAt: Math.max(tag1.modifiedAt ?? 0, tag2.modifiedAt ?? 0),
            deletedAt: Math.max(tag1.deletedAt ?? 0, tag2.deletedAt ?? 0),
            tweets,
            tweetsModifiedAt: mergedTweetsModifiedAt,
        };
    }

    // - Unique to data2
    for (const tag of tags2) {
        merged.tags[tag] = data2.tags[tag];
    }

    // Tweets
    const tweets1 = Object.keys(data1.tweets);
    const tweets2 = Object.keys(data2.tweets).filter((tweet) => !tweets1.includes(tweet));

    // - Shared and unique to data1
    for (const tweet of tweets1) {
        if (!Object.keys(data2.tweets).includes(tweet)) {
            merged.tweets[tweet] = data1.tweets[tweet];
            continue;
        }

        // Shared
        const tweet1 = data1.tweets[tweet];
        const tweet2 = data2.tweets[tweet];

        merged.tweets[tweet] = {
            modifiedAt: Math.max(tweet1.modifiedAt ?? 0, tweet2.modifiedAt ?? 0),
            deletedAt: Math.max(tweet1.deletedAt ?? 0, tweet2.deletedAt ?? 0),
            images: [...new Set([...tweet1.images, ...tweet2.images].map(stripQueryParameters))],
        };
    }

    // - Unique to data2
    for (const tweet of tweets2) {
        merged.tweets[tweet] = data2.tweets[tweet];
    }

    return merged;
}