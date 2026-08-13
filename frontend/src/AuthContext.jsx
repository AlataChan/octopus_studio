import React, { useState, createContext } from "react";
import { AUTH_TOKEN, AUTH_USER } from "@/utils/constants";
import {
  clearLocalAuthSession,
  markLocalAuthSessionValidated,
} from "@/utils/request";
import { getLocalStorageItem, setLocalStorageItem } from "@/utils/storage";

export const AuthContext = createContext(null);
export function AuthProvider(props) {
  const localUser = getLocalStorageItem(AUTH_USER);
  const localAuthToken = getLocalStorageItem(AUTH_TOKEN);
  const [store, setStore] = useState({
    user: localUser ? JSON.parse(localUser) : null,
    authToken: localAuthToken ? localAuthToken : null,
  });

  const [actions] = useState({
    updateUser: (user, authToken = "") => {
      setLocalStorageItem(AUTH_USER, JSON.stringify(user));
      setLocalStorageItem(AUTH_TOKEN, authToken);
      markLocalAuthSessionValidated();
      setStore({ user, authToken });
    },
    unsetUser: () => {
      clearLocalAuthSession();
      setStore({ user: null, authToken: null });
    },
  });

  return (
    <AuthContext.Provider value={{ store, actions }}>
      {props.children}
    </AuthContext.Provider>
  );
}
