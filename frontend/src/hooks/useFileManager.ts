import { openLoadingDialog, useImageViewerDialog } from "@/components/fc";
import OverwriteFilesPopUpContent from "@/components/OverwriteFilesPopUpContent.vue";

import { t } from "@/lang/i18n";
import {
  addFolder as addFolderApi,
  changePermission as changePermissionApi,
  compressFile as compressFileApi,
  copyFile as copyFileApi,
  deleteFile as deleteFileApi,
  downloadAddress,
  downloadFromUrl as downloadFromUrlAPI,
  fileList as getFileListApi,
  getFileStatus as getFileStatusApi,
  moveFile as moveFileApi,
  touchFile as touchFileApi,
  uploadAddress
} from "@/services/apis/fileManager";
import uploadService from "@/services/uploadService";
import { number2permission, permission2number } from "@/tools/permission";
import { mapDaemonAddress, parseForwardAddress, type RemoteMappingEntry } from "@/tools/protocol";
import { removeTrail } from "@/tools/string";
import { reportErrorMsg } from "@/tools/validator";
import type {
  Breadcrumb,
  DataType,
  DownloadFileConfigItem,
  FileStatus,
  OperationForm,
  Permission
} from "@/types/fileManager";
import { ExclamationCircleOutlined } from "@ant-design/icons-vue";
import { useLocalStorage } from "@vueuse/core";
import { message, Modal } from "ant-design-vue";
import type { Key } from "ant-design-vue/es/table/interface";
import { v4 } from "uuid";
import { computed, createVNode, onMounted, reactive, ref, type VNodeRef } from "vue";

export function getFileConfigAddr(config: { addr: string; remoteMappings?: RemoteMappingEntry[] }) {
  let addr = config.addr;
  if (config.remoteMappings) {
    const mapped = mapDaemonAddress(config.remoteMappings);
    if (mapped) {
      addr = mapped.addr + mapped.prefix;
    }
  }
  return addr;
}

interface TabItem {
  name: string;
  path: string;
  closable: boolean;
  key: string;
  pushedTime: number;
}

interface TabsMap {
  [key: string]: TabItem[];
}

const TAB_LIST_KEY = "FileManagerTabMap";

export const useFileManager = (instanceId: string = "", daemonId: string = "") => {
  const tabList = useLocalStorage<TabsMap>(TAB_LIST_KEY, {});
  const dataSource = ref<DataType[]>([]);
  const fileStatus = ref<FileStatus>();
  const selectedRowKeys = ref<Key[]>([]);
  const selectionData = ref<DataType[]>([]);
  const isMultiple = computed(() => selectionData.value && selectionData.value.length > 1);
  const spinning = ref(false);
  const currentDisk = ref(t("TXT_CODE_28124988"));

  const operationForm = ref<OperationForm>({
    name: "",
    current: 1,
    pageSize: 100,
    total: 0
  });

  const breadcrumbs = reactive<Breadcrumb[]>([]);

  const currentPath = computed(() => {
    if (breadcrumbs.length === 0) return "/";
    const lastPath = breadcrumbs[breadcrumbs.length - 1].path;
    return removeTrail(lastPath, "/") + "/";
  });

  const currentTabKey = instanceId + daemonId;
  const currentTabs = computed(() => tabList.value[currentTabKey] ?? []);
  const activeTab = ref<string>("");

  const clipboard = ref<{
    type: "copy" | "move";
    value: string[];
  }>();

  // --- Path Parsing ---
  const parsePath = (path: string) => {
    if (!path || path === "/") return ["/"];
    const normalizedPath = path.replace(/\\/g, "/");
    const driveMatch = normalizedPath.match(/^([a-zA-Z]):/);
    const driveLetter = driveMatch ? driveMatch[1] : "";
    const pathPart = driveLetter ? normalizedPath.slice(2) : normalizedPath;

    const parts = pathPart.split("/").filter(Boolean);
    const result = driveLetter ? [driveLetter] : ["/"];

    parts.forEach((_, index) => {
      const _currentPath = "/" + parts.slice(0, index + 1).join("/");
      result.push(index < parts.length - 1 ? _currentPath + "/" : _currentPath);
    });
    return result;
  };

  const getLastNameFromPath = (path: string) => {
    if (path === "/" || !path) return "/";
    const cleanPath = path.endsWith("/") ? path.slice(0, -1) : path;
    const parts = cleanPath.split("/").filter((part) => part !== "");
    return parts.length > 0 ? parts[parts.length - 1] : "/";
  };

  const updateBreadcrumbs = (path: string) => {
    const breadcrumbPaths = parsePath(path);
    breadcrumbs.splice(0, breadcrumbs.length);

    if (breadcrumbPaths[0] !== "/" && breadcrumbPaths[0].length === 1) {
      currentDisk.value = breadcrumbPaths[0];
      breadcrumbPaths.forEach((p) => {
        breadcrumbs.push({
          path: p === currentDisk.value ? `${currentDisk.value}:/` : `${currentDisk.value}:${p}`,
          name: p === currentDisk.value ? "/" : getLastNameFromPath(p),
          disabled: false
        });
      });
    } else {
      currentDisk.value = t("TXT_CODE_28124988");
      breadcrumbPaths.forEach((p) => {
        breadcrumbs.push({
          path: p,
          name: getLastNameFromPath(p),
          disabled: false
        });
      });
    }
  };

  // --- Tab Logic ---
  const initDefaultTab = (path = "/") => {
    const key = v4();
    tabList.value[currentTabKey] ||= [];
    tabList.value[currentTabKey].push({
      key,
      path,
      name: getLastNameFromPath(path),
      pushedTime: Date.now(),
      closable: false
    });
    activeTab.value = key;
    handleChangeTab(key);
  };

  const handleChangeTab = async (key: string) => {
    const targetTab = currentTabs.value.find((tab) => tab.key === key);
    if (!targetTab) return;

    activeTab.value = key;
    updateBreadcrumbs(targetTab.path);

    dataSource.value = [];
    spinning.value = true;
    operationForm.value.name = "";
    operationForm.value.current = 1;
    await getFileList();
    spinning.value = false;
  };

  const onEditTabs = (targetKey: MouseEvent | Key | KeyboardEvent, action: "remove" | "add") => {
    if (action === "add") {
      if (currentTabs.value.length >= 10) return message.warning(t("TXT_CODE_22042570"));
      const key = v4();
      currentTabs.value.push({
        name: "/", path: "/", closable: true, key, pushedTime: Date.now()
      });
      handleChangeTab(key);
    } else {
      handleRemoveTab(targetKey as string);
    }
  };

  const handleRemoveTab = (key: string) => {
    const index = currentTabs.value.findIndex((tab) => tab.key === key);
    if (index === -1) return;
    currentTabs.value.splice(index, 1);
    if (currentTabs.value.length === 0) {
      initDefaultTab();
    } else if (activeTab.value === key) {
      const nextTab = currentTabs.value[Math.max(0, index - 1)];
      handleChangeTab(nextTab.key);
    }
  };

  // --- API Actions ---
  const getFileList = async (throwErr = false) => {
    const { execute } = getFileListApi();
    const thisTab = currentTabs.value.find((e) => e.key === activeTab.value);
    try {
      clearSelected();
      const path = currentPath.value;
      const res = await execute({
        params: {
          daemonId: daemonId || "",
          uuid: instanceId || "",
          page: operationForm.value.current - 1,
          page_size: operationForm.value.pageSize,
          file_name: operationForm.value.name,
          target: path
        }
      });
      dataSource.value = res.value?.items || [];
      operationForm.value.total = res.value?.total || 0;
      if (thisTab) {
        thisTab.path = path;
        thisTab.name = getLastNameFromPath(path);
      }
    } catch (error: any) {
      if (throwErr) throw error;
      reportErrorMsg(error.message);
    }
  };

  const handleChangeDir = async (dir: string) => {
    const index = breadcrumbs.findIndex((e) => e.path === dir);
    if (index === -1) {
      updateBreadcrumbs(dir);
    } else {
      breadcrumbs.splice(index + 1);
    }
    spinning.value = true;
    operationForm.value.current = 1;
    await getFileList();
    spinning.value = false;
  };

  const rowClickTable = async (item: string, type: number) => {
    if (type === 1) return;
    try {
      spinning.value = true;
      const target = currentPath.value + item;
      breadcrumbs.push({ path: target, name: item, disabled: false });
      operationForm.value.current = 1;
      await getFileList(true);
    } catch (error: any) {
      breadcrumbs.pop();
      reportErrorMsg(error.message);
    } finally {
      spinning.value = false;
    }
  };

  // --- File Operations (Full Port) ---
  const touchFile = async (dir?: boolean) => {
    const name = await openDialog(
      dir ? t("TXT_CODE_6215388a") : t("TXT_CODE_791c73e9"),
      dir ? t("TXT_CODE_1b450b79") : t("TXT_CODE_59cb16ff")
    );
    const execute = dir ? addFolderApi().execute : touchFileApi().execute;
    try {
      await execute({
        params: { uuid: instanceId || "", daemonId: daemonId || "" },
        data: { target: currentPath.value + name }
      });
      message.success(t("TXT_CODE_d28c05df"));
      await getFileList();
    } catch (e: any) { reportErrorMsg(e.message); }
  };

  const deleteFile = async (file?: string) => {
    const { execute } = deleteFileApi();
    Modal.confirm({
      title: t("TXT_CODE_71155575"),
      icon: createVNode(ExclamationCircleOutlined),
      content: createVNode("div", { style: "color:red;" }, t("TXT_CODE_6a10302d")),
      async onOk() {
        const targets = file ? [currentPath.value + file] : selectionData.value?.map(e => currentPath.value + e.name);
        if (!targets?.length) return;
        try {
          await execute({
            params: { uuid: instanceId || "", daemonId: daemonId || "" },
            data: { targets }
          });
          message.success(t("TXT_CODE_cae10a08"));
          await getFileList();
        } catch (e: any) { reportErrorMsg(e.message); }
      }
    });
  };

  const resetName = async (file: string) => {
    const newname = await openDialog(t("TXT_CODE_c83551f5"), t("TXT_CODE_a5830778"), file);
    try {
      await moveFileApi().execute({
        params: { uuid: instanceId || "", daemonId: daemonId || "" },
        data: { targets: [[currentPath.value + file, currentPath.value + newname]] }
      });
      message.success(t("TXT_CODE_5b990e2e"));
      await getFileList();
    } catch (e: any) { reportErrorMsg(e.message); }
  };

  const setClipBoard = (type: "copy" | "move", file?: string) => {
    const value = file ? [currentPath.value + file] : selectionData.value?.map(e => currentPath.value + e.name);
    if (!value?.length) return reportErrorMsg(t("TXT_CODE_b152cd75"));
    clipboard.value = { type, value };
    message.success(t("TXT_CODE_25cb04bb"));
    clearSelected();
  };

  const paste = async () => {
    if (!clipboard.value?.value.length) return reportErrorMsg(t("TXT_CODE_b152cd75"));
    const execute = clipboard.value.type === "copy" ? copyFileApi().execute : moveFileApi().execute;
    try {
      await execute({
        params: { uuid: instanceId || "", daemonId: daemonId || "" },
        data: { targets: clipboard.value.value.map(v => [v, currentPath.value + v.split("/").pop()]) }
      });
      message.success(t("TXT_CODE_93d4b66a"));
      await getFileList();
      clipboard.value.value = [];
    } catch (e: any) { reportErrorMsg(e.message); }
  };

  const zipFile = async () => {
    if (!selectionData.value?.length) return reportErrorMsg(t("TXT_CODE_b152cd75"));
    const filename = await openDialog(t("TXT_CODE_f8a15a94"), t("TXT_CODE_366bad15"), "", "zip");
    const loading = await openLoadingDialog(t("TXT_CODE_b3825da"), t("TXT_CODE_ba027d6c"), t("TXT_CODE_e1070b52"));
    try {
      await compressFileApi().execute({
        params: { uuid: instanceId || "", daemonId: daemonId || "" },
        data: { type: 1, code: "utf-8", source: currentPath.value + filename + ".zip", targets: selectionData.value.map(e => currentPath.value + e.name) }
      });
      message.success(t("TXT_CODE_c3a933d3"));
      await getFileList();
    } catch (e: any) { reportErrorMsg(e.message); } finally { loading.cancel(); }
  };

  const unzipFile = async (name: string) => {
    const dirname = await openDialog(t("TXT_CODE_7669fd3f"), "", "", "unzip");
    const loading = await openLoadingDialog(t("TXT_CODE_b3825da"), t("TXT_CODE_b82225c3"), t("TXT_CODE_6f038f25"));
    try {
      await compressFileApi().execute({
        params: { uuid: instanceId || "", daemonId: daemonId || "" },
        data: { type: 2, code: dialog.value.code, source: currentPath.value + name, targets: dialog.value.unzipmode === "0" ? currentPath.value : currentPath.value + dirname }
      });
      message.success(t("TXT_CODE_c3a933d3"));
      await getFileList();
    } catch (e: any) { reportErrorMsg(e.message); } finally { loading.cancel(); }
  };

  // --- Upload / Download ---
  const selectedFiles = async (files: File[]) => {
    const { execute: getUploadCfg, state: missionCfg } = uploadAddress();
    for (const file of files) {
      try {
        await getUploadCfg({ params: { upload_dir: currentPath.value, daemonId: daemonId!, uuid: instanceId!, file_name: file.name } });
        if (!missionCfg.value) throw new Error(t("TXT_CODE_e8ce38c2"));
        const addr = parseForwardAddress(getFileConfigAddr(missionCfg.value), "http");
        uploadService.append(file, addr, missionCfg.value.password, { overwrite: true }, (task) => {
          task.instanceInfo = { instanceId: instanceId || "", daemonId: daemonId || "" };
        });
      } catch (e: any) { reportErrorMsg(e.message); }
    }
  };

  const downloadFile = async (fileName: string) => {
    const { execute: getDownloadCfg, state: cfg } = downloadAddress();
    try {
      await getDownloadCfg({ params: { file_name: currentPath.value + fileName, daemonId: daemonId || "", uuid: instanceId || "" } });
      if (cfg.value) {
        const addr = parseForwardAddress(getFileConfigAddr(cfg.value), "http");
        window.open(`${addr}/download/${cfg.value.password}/${fileName}`);
      }
    } catch (e: any) { reportErrorMsg(e.message); }
  };

  const downloadFromUrl = async (config: DownloadFileConfigItem) => {
    const loading = await openLoadingDialog(t("TXT_CODE_b3825da"), t("TXT_CODE_2b5b8a3d"), t("TXT_CODE_6f038f25"));
    try {
      await downloadFromUrlAPI().execute({
        params: { uuid: instanceId || "", daemonId: daemonId || "" },
        data: { url: config.url, file_name: currentPath.value + config.fileName }
      });
      message.success(t("TXT_CODE_c3a933d3"));
      await getFileList();
    } catch (e: any) { reportErrorMsg(e.message); } finally { loading.cancel(); }
  };

  // --- Permissions & Status ---
  const permission = reactive<Permission>({
    data: { owner: [], usergroup: [], everyone: [] },
    deep: false, loading: false,
    item: [{ key: t("TXT_CODE_2e5d3d0f"), role: "owner" }, { key: t("TXT_CODE_e7b75c0e"), role: "usergroup" }, { key: t("TXT_CODE_5c54f599"), role: "everyone" }]
  });

  const changePermission = async (name: string, mode: number) => {
    permission.data = number2permission(mode);
    await openDialog(t("TXT_CODE_16853efe"), "", "", "permission", { maxWidth: "400px" });
    try {
      await changePermissionApi().execute({
        params: { daemonId: daemonId || "", uuid: instanceId || "" },
        data: { chmod: permission2number(permission.data.owner, permission.data.usergroup, permission.data.everyone), deep: permission.deep, target: currentPath.value + name }
      });
      message.success(t("TXT_CODE_b05948d1"));
      await getFileList();
    } catch (e: any) { reportErrorMsg(e.message); }
  };

  const getFileStatus = async () => {
    const { state, execute } = getFileStatusApi();
    try {
      await execute({ params: { daemonId: daemonId || "", uuid: instanceId || "" } });
      if (state.value) fileStatus.value = state.value;
    } catch (e: any) { reportErrorMsg(e.message); }
  };

  // --- Helper UI Methods ---
  const dialog = ref({
    show: false, title: "", value: "", info: "", mode: "", unzipmode: "0", code: "utf-8",
    ref: ref<VNodeRef>(), ok: () => {}, cancel: () => { dialog.value.show = false; }, style: {}
  });

  const openDialog = (title: string, info: string, defaultValue?: string, mode?: string, style?: object): Promise<string> => {
    dialog.value = { ...dialog.value, title, info, value: defaultValue || "", mode: mode || "", show: true, style: style || {} };
    return new Promise((resolve) => {
      dialog.value.ok = () => {
        if (!dialog.value.value && !["unzip", "permission"].includes(dialog.value.mode)) return reportErrorMsg(t("TXT_CODE_4ea93630"));
        resolve(dialog.value.value);
        dialog.value.show = false;
      };
    });
  };

  const selectChanged = (keys: Key[], rows: DataType[]) => {
    selectedRowKeys.value = keys;
    selectionData.value = rows;
  };

  const clearSelected = () => {
    selectedRowKeys.value = [];
    selectionData.value = [];
  };

  const handleTableChange = (e: any) => {
    operationForm.value.current = e.current;
    operationForm.value.pageSize = e.pageSize;
    getFileList();
  };

  onMounted(() => {
    if (currentTabs.value.length === 0) initDefaultTab();
    else {
      activeTab.value = currentTabs.value[0].key;
      handleChangeTab(activeTab.value);
    }
  });

  return {
    fileStatus, dialog, spinning, operationForm, dataSource, breadcrumbs,
    currentPath, selectionData, selectedRowKeys, activeTab, currentTabs,
    tabList, currentTabKey, currentDisk, isMultiple, clipboard, permission,
    selectChanged, onEditTabs, handleChangeTab, openDialog, getFileList,
    touchFile, reloadList: () => getFileList(), setClipBoard, paste, 
    deleteFile, rowClickTable, resetName, zipFile, unzipFile,
    selectedFiles, downloadFile, downloadFromUrl, handleChangeDir,
    handleTableChange, handleSearchChange: () => { operationForm.value.current = 1; getFileList(); },
    getFileStatus, changePermission,
    toDisk: async (disk: string) => {
      const diskName = disk === "/" ? "/" : disk + ":/";
      updateBreadcrumbs(diskName);
      getFileList();
    },
    isImage: (ext: string) => ["JPG", "JPEG", "PNG", "GIF", "BMP", "WEBP", "ICO"].includes(ext?.toUpperCase()),
    showImage: (file: DataType) => useImageViewerDialog(instanceId || "", daemonId || "", file.name, currentPath.value)
  };
};
