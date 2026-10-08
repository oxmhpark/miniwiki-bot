import type { Sierra } from './sierra.js';

/**
 * **검사용 가짜 시에라** — `miniwiki-bot/testing`으로 든다. 운영 코드가 가져가는 자리가 아니다.
 *
 * 준 문만 답하고 **나머지는 불리면 던진다** — 어느 문을 썼는지가 곧 그 봇이 시에라에게
 * 무엇을 묻는 봇인가의 목록이고, 뜻밖의 문이 열리면 검사가 그 자리에서 깨져야 한다.
 * 봇마다 자기가 쓰는 문을 덮어 쓴다(에코는 메시지함과 발행, 채토는 알림과 쓰레드).
 */
export function fakeSierra(given: Partial<Sierra> = {}): Sierra {
  return {
    me: given.me ?? unused('me'),
    maxPostLength: given.maxPostLength ?? unused('maxPostLength'),
    federates: given.federates ?? unused('federates'),
    searchPosts: given.searchPosts ?? unused('searchPosts'),
    post: given.post ?? unused('post'),
    lookup: given.lookup ?? unused('lookup'),
    accountPosts: given.accountPosts ?? unused('accountPosts'),
    tagPosts: given.tagPosts ?? unused('tagPosts'),
    documentByPath: given.documentByPath ?? unused('documentByPath'),
    documentSource: given.documentSource ?? unused('documentSource'),
    searchDocuments: given.searchDocuments ?? unused('searchDocuments'),
    documentUpdates: given.documentUpdates ?? unused('documentUpdates'),
    createDocument: given.createDocument ?? unused('createDocument'),
    saveDocument: given.saveDocument ?? unused('saveDocument'),
    notifications: given.notifications ?? unused('notifications'),
    context: given.context ?? unused('context'),
    reply: given.reply ?? unused('reply'),
    message: given.message ?? unused('message'),
    messages: given.messages ?? unused('messages'),
    account: given.account ?? unused('account'),
    publish: given.publish ?? unused('publish'),
    fetchMedia: given.fetchMedia ?? unused('fetchMedia'),
    uploadMedia: given.uploadMedia ?? unused('uploadMedia'),
    uploadAsset: given.uploadAsset ?? unused('uploadAsset'),
    assetToMedia: given.assetToMedia ?? unused('assetToMedia'),
    lastPost: given.lastPost ?? unused('lastPost'),
    membership: given.membership ?? unused('membership'),
    refreshManifest: given.refreshManifest ?? unused('refreshManifest'),
  };
}

function unused(name: keyof Sierra): () => Promise<never> {
  return async () => {
    throw new Error(`가짜 시에라: ${name}은(는) 부르지 않는다`);
  };
}
