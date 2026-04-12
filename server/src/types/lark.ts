// Feishu (Lark) API response types — based on actual lark-cli output

/** Avatar object from search results */
export interface LarkAvatar {
  avatar_origin?: string;
  avatar_thumb?: string;   // 72x72 (from +get-user)
  avatar_middle?: string;  // 240x240 (from +get-user)
  avatar_big?: string;     // 640x640 (from +get-user)
}

/** User object inside data.user or data.users[] */
export interface LarkUser {
  open_id: string;
  union_id?: string;
  name: string;
  en_name?: string;
  avatar?: LarkAvatar;
  avatar_url?: string;     // flat avatar_url from +get-user response
  avatar_thumb?: string;   // flat fields on get-user
  avatar_middle?: string;
  avatar_big?: string;
  job_title?: string;
  department_ids?: string[];
  email?: string;
  mobile?: string;
  city?: string;
  tenant_key?: string;
}

/** Wrapper for actual lark-cli response: { ok, identity, data: { user } } */
export interface LarkGetUserResponse {
  ok: boolean;
  data: {
    user: LarkUser;
  };
}

/** Wrapper for actual lark-cli response: { ok, identity, data: { users, has_more } } */
export interface LarkSearchUsersResponse {
  ok: boolean;
  data: {
    users: LarkUser[];
    has_more: boolean;
    page_token?: string;
  };
}

