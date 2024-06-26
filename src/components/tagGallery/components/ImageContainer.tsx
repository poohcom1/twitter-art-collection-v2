import { Show, createEffect } from 'solid-js';
import styles from '../tag-gallery.module.scss';
import tagIconBold from '/src/assets/tag-bold.svg';
import eyeIcon from '/src/assets/eye.svg';
import tagCheckIcon from '/src/assets/file-check.svg';
import tagMinusIcon from '/src/assets/file-minus.svg';
import externalLinkIcon from '/src/assets/link-external.svg';
import trashIcon from '/src/assets/trash.svg';
import { formatTagName, parseHTML } from '../../../utils';
import { removeTag, removeTweet } from '../../../services/storage';
import { Svg } from '../../common/Svg';
import { TagModalOptions } from '../../tagModal/TagModal';

export interface ImageProps {
    tweetId: string;
    src: string;

    selectedTags: string[];
    tags: string[];
    showTagCount: boolean;
    outlined: boolean;
    onClick?: () => void;
    setLockHover: (lock: boolean) => void;

    onMouseEnter?: () => void;
    onMouseLeave?: () => void;

    onContextMenu?: () => void;
    onTagModalShow?: (visibility: TagModalOptions) => void;
    onTagModalHide?: () => void;

    onTagSelected: (tags: string[]) => void;

    key?: string;
}

export const ImageContainer = (props: ImageProps) => {
    let ref: HTMLElement;

    createEffect(() => {
        const contextMenu = new VanillaContextMenu({
            scope: ref,
            transitionDuration: 0,
            menuItems: [],
            normalizePosition: true,
            customNormalizeScope: document.querySelector<HTMLElement>('main')!
                .firstElementChild as HTMLElement,
            openSubMenuOnHover: true,
            preventCloseOnClick: true,
            customClass: styles.contextMenu,
            onClose: () => {
                props.setLockHover?.(false);
                props.onTagModalHide?.();
            },
        });

        const menuItems: MenuItem[] = [
            {
                label: 'Edit tags',
                iconHTML: createContextMenuIcon(tagCheckIcon),
                callback: async (_, currentEvent) => {
                    currentEvent.stopPropagation();

                    const rect = (
                        currentEvent.currentTarget as HTMLElement
                    ).getBoundingClientRect();

                    props.onTagModalShow?.({
                        position: {
                            top: rect.top,
                            right: rect.right,
                            left: rect.left,
                            space: 1,
                        },
                        tweetId: props.tweetId,
                    });
                },
            },
        ];

        if (props.selectedTags.length === 1) {
            menuItems.push({
                label: `Untag ${formatTagName(props.selectedTags[0])}`,
                iconHTML: createContextMenuIcon(tagMinusIcon),
                callback: async () => {
                    await removeTag(props.tweetId, props.selectedTags[0]);
                    contextMenu.close();
                },
            });
        }

        menuItems.push(
            {
                label: 'Delete tweet',
                iconHTML: createContextMenuIcon(trashIcon),
                callback: async () => {
                    if (confirm('Are you sure you want to delete this tweet from all tags?')) {
                        await removeTweet(props.tweetId);
                    }
                    contextMenu.close();
                },
            },
            'hr',
            {
                label: 'Open tweet',
                iconHTML: createContextMenuIcon(externalLinkIcon),
                callback: () => {
                    window.open(`/poohcom1/status/${props.tweetId}`, '_blank');
                    contextMenu.close();
                },
            },
            {
                label: 'Open image',
                iconHTML: createContextMenuIcon(eyeIcon),
                callback: () => {
                    window.open(props.src, '_blank');
                    contextMenu.close();
                },
            }
        );

        contextMenu.updateOptions({ ...contextMenu.options, menuItems });
    });

    createEffect(() => {
        ref.addEventListener('contextmenu', () => props.onContextMenu?.());
    });

    return (
        <button
            ref={(el) => (ref = el)}
            onClick={props.onClick}
            onMouseEnter={props.onMouseEnter}
            onMouseLeave={props.onMouseLeave}
            class={`${styles.imageContainer} ${props.outlined && styles.imageContainerHover}`}
        >
            <Show when={props.showTagCount}>
                <div class={styles.tagCountContainer}>
                    <Svg svg={tagIconBold} />
                    <span class={styles.tagCount}>{props.tags.length}</span>
                </div>
            </Show>
            <img src={props.src} loading="lazy" />
        </button>
    );
};

function createContextMenuIcon(iconSvg: string): string {
    const icon = parseHTML(iconSvg);
    icon.classList.add(styles.contextMenuIcon);
    return icon.outerHTML;
}
