-- 全文检索索引：conversations.title
CREATE INDEX conversations_title_fts ON conversations USING GIN (to_tsvector('simple', title));

-- 全文检索索引：messages.content
CREATE INDEX messages_content_fts ON messages USING GIN (to_tsvector('simple', content));

-- 复合索引：按 owner + 软删除状态 + 更新时间查询历史列表
CREATE INDEX conversations_owner_deleted_updated ON conversations ("ownerUserId", "deletedAt", "updatedAt" DESC);
