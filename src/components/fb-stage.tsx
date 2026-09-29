import { Heart, MessageCircle, Share2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { analyzeComment, type ThreadComment } from "@/lib/reply/catalog.ts";

interface FbStageProps {
  pageName: string;
  actorName: string;
  postUrl: string;
  comments: ThreadComment[];
  activeId: string | null;
  composerFor: string | null;
  draft: string;
  typing: boolean;
  sendVia: "arrow" | "enter" | null;
  likingId: string | null;
  replyArmedId: string | null;
  busy: boolean;
  onReply: (id: string) => void;
  onLike: (id: string) => void;
}

export function FbStage({
  pageName,
  actorName,
  postUrl,
  comments,
  activeId,
  composerFor,
  draft,
  typing,
  sendVia,
  likingId,
  replyArmedId,
  busy,
  onReply,
  onLike,
}: FbStageProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const replyCount = 22 + comments.filter((row) => row.reply).length;
  let hostPath = "facebook.com";
  try {
    if (postUrl.trim()) {
      const url = new URL(postUrl.trim());
      hostPath = `${url.hostname}${url.pathname}`;
    }
  } catch {
    hostPath = "facebook.com";
  }

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!activeId || !scroller) return;
    const composer = scroller.querySelector(`[data-comment="${activeId}"] .composer`);
    const node = composer ?? scroller.querySelector(`[data-comment="${activeId}"]`);
    if (!(node instanceof HTMLElement)) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const delta = nodeRect.top - scrollerRect.top - scroller.clientHeight / 2 + nodeRect.height / 2;
    scroller.scrollTop += delta;
  }, [activeId, composerFor]);

  return (
    <section className="stage" aria-label="Khung bài viết">
      <div className="stage-bar">
        <span className="dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <p className="stage-url">{hostPath}</p>
        <span className="stage-badge">CDP mẫu</span>
      </div>
      <div className="fb" ref={scrollerRef}>
        <header className="fb-top">
          <h2>Bài viết của {pageName}</h2>
          <span className="fb-x" aria-hidden="true">
            ×
          </span>
        </header>
        <div className="gallery" aria-hidden="true">
          <div className="photo photo-a" />
          <div className="photo photo-b" />
          <div className="more photo photo-c">
            <span>+2</span>
          </div>
        </div>
        <div className="fb-links">
          <span>Xem thông tin chi tiết</span>
          <span className="ad-pill">Tạo quảng cáo</span>
        </div>
        <div className="fb-stats">
          <span className="reacts">
            <Heart size={14} />
            112
          </span>
          <span>
            <MessageCircle size={14} />
            {replyCount}
          </span>
          <span>
            <Share2 size={14} />1
          </span>
        </div>
        <p className="sort">Phù hợp nhất</p>
        <ol className="thread">
          {comments.map((comment) => {
            const active = comment.id === activeId;
            const open = comment.id === composerFor;
            const intent = comment.role === "customer" ? analyzeComment(comment.body) : null;
            return (
              <li key={comment.id} data-comment={comment.id} className={active ? "is-current" : ""}>
                <article className="comment">
                  <span className={`avatar tone-${comment.tone}`} aria-hidden="true">
                    {comment.initials}
                  </span>
                  <div className="comment-main">
                    <div className={`bubble ${active ? "is-active" : ""}`}>
                      <header>
                        <strong>{comment.author}</strong>
                        <span>{comment.timeLabel}</span>
                        {comment.role === "author" ? <em>Tác giả</em> : null}
                        {intent ? <em className="intent">{intent.label}</em> : null}
                      </header>
                      <p>{comment.body}</p>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className={comment.liked || likingId === comment.id ? "is-liked" : ""}
                        disabled={busy}
                        onClick={() => onLike(comment.id)}
                      >
                        Thích
                      </button>
                      <button
                        type="button"
                        className={replyArmedId === comment.id ? "is-armed" : ""}
                        disabled={busy || comment.role !== "customer" || Boolean(comment.reply)}
                        onClick={() => onReply(comment.id)}
                      >
                        Trả lời
                      </button>
                    </div>
                    {open ? (
                      <div className="composer">
                        <span className="avatar tone-0" aria-hidden="true">
                          PM
                        </span>
                        <div
                          className="composer-box"
                          role="textbox"
                          aria-readonly="true"
                          aria-label={`Trả lời ${comment.author}`}
                        >
                          {draft ? (
                            <span>
                              {draft}
                              {typing ? <i className="caret" /> : null}
                            </span>
                          ) : (
                            <span className="placeholder">
                              Trả lời {comment.author}
                              {typing ? <i className="caret" /> : null}
                            </span>
                          )}
                        </div>
                        <span className={`send ${sendVia === "arrow" ? "is-press" : ""}`} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <path
                              d="M4 12h12M12 6l6 6-6 6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        {sendVia === "enter" ? <kbd>Enter</kbd> : null}
                      </div>
                    ) : null}
                    {comment.reply ? (
                      <div className="nested">
                        <span className="avatar tone-0" aria-hidden="true">
                          PM
                        </span>
                        <div className="bubble sent">
                          <header>
                            <strong>{actorName}</strong>
                            <span>Vừa xong</span>
                          </header>
                          <p>{comment.reply}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
        <div className="fb-foot">
          <span className="avatar tone-0">PM</span>
          <p>Bình luận dưới tên {actorName}</p>
        </div>
      </div>
    </section>
  );
}
