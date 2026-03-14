import { message, Modal } from "ant-design-vue";
import type { Key } from "ant-design-vue/es/table/interface";
import { ref, createVNode, reactive, type VNodeRef, computed, onMounted } from "vue";
import { ExclamationCircleOutlined } from "@ant-design/icons-vue";
import { parseForwardAddress } from "@/tools/protocol";
import { number2permission, permission2number } from "@/tools/permission";
import { t } from "@/lang/i18n";
import {
  fileList as getFileListApi,
  getFileStatus as getFileStatusApi,
  addFolder as addFolderApi,
  deleteFile as deleteFileApi,
  touchFile as touchFileApi,
  copyFile as copyFileApi,
  moveFile as moveFileApi,
  compressFile as compressFileApi,
  uploadAddress,
  downloadAddress,
  changePermission as changePermissionApi
} from "@/services/apis/fileManager";
import type {
  DataType,
  OperationForm,
  Breadcrumb,
  FileStatus,
  Permission
} from "@/types/fileManager";
import { reportErrorMsg } from "@/tools/validator";
import { openLoadingDialog } from "@/components/fc";
import { useImageViewerDialog } from "@/components/fc";
import uploadService from "@/services/uploadService";
import OverwriteFilesPopUpContent from "@/components/OverwriteFilesPopUpContent.vue";

// --- 多分頁功能新增：定義接口與常量 ---
import { useLocalStorage } from "@vueuse/core";
import { v4 } from "uuid";
import { removeTrail } from "@/tools/string";

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
  // --- 多分頁功能新增：狀態初始化 ---
  const tabList = useLocalStorage<TabsMap>(TAB_LIST_KEY, {});
  const currentTabKey = (instanceId || "") + (daemonId || "");
  const currentTabs = computed(() => tabList.value[currentTabKey] ?? []);
  const activeTab = ref<string>("");

  const dataSource = ref<DataType[]>();
  const fileStatus = ref<FileStatus>();
  const selectedRowKeys = ref<Key[]>([]);
  const selectionData = ref<DataType[]>();
  const isMultiple = computed(() => selectionData.value && selectionData.value.length > 1);
  const operationForm = ref<OperationForm>({
    name: "",
    current: 1,
    pageSize: 100,
    total: 0
  });

  const breadcrumbs = reactive<Breadcrumb[]>([]);
  
  // --- 多分頁功能新增：計算當前路徑 ---
  const currentPath = computed(() => {
    if (breadcrumbs.length === 0) return "/";
    return removeTrail(breadcrumbs[breadcrumbs.length - 1].path, "/") + "/";
  });

  const clipboard = ref<{
    type: "copy" | "move";
    value: string[];
  }>();

  const dialog = ref({
    show: false,
    title: "Dialog",
    loading: false,
    value: "",
    info: "",
    mode: "",
    unzipmode: "0",
    code: "utf-8",
    ref: ref<VNodeRef>(),
    ok: () => {},
    cancel: () => {
      dialog.value.value = "";
    },
    style: {}
  });

  // --- 多分頁功能新增：路徑解析工具 ---
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

  // --- 多分頁功能新增：標籤管理邏輯 ---
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
    updateBreadcrumbs(path);
    getFileList();
  };

  const handleChangeTab = async (key: string) => {
    const targetTab = currentTabs.value.find((tab) => tab.key === key);
    if (!targetTab) return;
    activeTab.value = key;
    updateBreadcrumbs(targetTab.path);
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

  const openDialog = (
    title: string,
    info: string,
    defaultValue?: string,
    mode?: string,
    style?: object
  ): Promise<string> => {
    dialog.value.style = style || {};
    dialog.value.value = defaultValue || "";
    dialog.value.mode = mode || "";

    dialog.value.title = title;
    dialog.value.info = info;
    dialog.value.show = true;

    (dialog.value?.ref as any)?.focus();

    return new Promise((resolve) => {
      dialog.value.ok = () => {
        if (
          dialog.value.value == "" &&
          dialog.value.mode != "unzip" &&
          dialog.value.mode != "permission"
        ) {
          return reportErrorMsg(t("TXT_CODE_4ea93630"));
        }
        resolve(dialog.value.value);
        dialog.value.show = false;
        dialog.value.value = "";
        dialog.value.info = "";
        dialog.value.mode = "";
        dialog.value.style = {};
        dialog.value.ok = () => {};
      };
    });
  };

  const getFileList = async (throwErr = false) => {
    const { execute } = getFileListApi();
    const thisTab = currentTabs.value.find((e) => e.key === activeTab.value);
    try {
      clearSelected();
      const path = currentPath.value; // 使用計算出的 currentPath
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
      
      // 同步標籤信息
      if (thisTab) {
        thisTab.path = path;
        thisTab.name = getLastNameFromPath(path);
      }
    } catch (error: any) {
      if (throwErr) throw error;
      return reportErrorMsg(error.message);
    }
  };

  const reloadList = async () => {
    await getFileList();
    return message.success(t("TXT_CODE_8ccb5428"));
  };

  const touchFile = async (dir?: boolean) => {
    clearSelected();
    const dirname = dir
      ? await openDialog(t("TXT_CODE_6215388a"), t("TXT_CODE_1b450b79"))
      : await openDialog(t("TXT_CODE_791c73e9"), t("TXT_CODE_59cb16ff"));
    const execute = dir ? addFolderApi().execute : touchFileApi().execute;

    try {
      await execute({
        params: {
          uuid: instanceId || "",
          daemonId: daemonId || ""
        },
        data: {
          target: currentPath.value + dirname
        }
      });
      await getFileList();
      message.success(t("TXT_CODE_d28c05df"));
    } catch (error: any) {
      return reportErrorMsg(error.message);
    }
  };

  const setClipBoard = (type: "copy" | "move", file?: string) => {
    if (file) {
      clipboard.value = {
        type,
        value: [currentPath.value + file]
      };
    } else {
      if (!selectionData.value || selectionData.value.length === 0)
        return reportErrorMsg(t("TXT_CODE_b152cd75"));
      clipboard.value = {
        type,
        value: selectionData.value?.map((e) => currentPath.value + e.name)
      };
    }
    message.success(t("TXT_CODE_25cb04bb"));
    clearSelected();
  };

  const paste = async () => {
    if (!clipboard?.value?.type || !clipboard.value.value)
      return reportErrorMsg(t("TXT_CODE_b152cd75"));
    const execute = clipboard.value.type == "copy" ? copyFileApi().execute : moveFileApi().execute;
    try {
      await execute({
        params: {
          uuid: instanceId || "",
          daemonId: daemonId || ""
        },
        data: {
          targets: clipboard.value.value.map((e) => [
            e,
            currentPath.value + e.split("/")[e.split("/").length - 1]
          ])
        }
      });
      await getFileList();
      message.success(t("TXT_CODE_93d4b66a"));
      clearSelected();
      clipboard.value.value = [];
    } catch (error: any) {
      reportErrorMsg(error.message);
    }
  };

  const resetName = async (file: string) => {
    const newname = await openDialog(t("TXT_CODE_c83551f5"), t("TXT_CODE_a5830778"), file);
    try {
      const { execute } = moveFileApi();
      await execute({
        params: {
          uuid: instanceId || "",
          daemonId: daemonId || ""
        },
        data: {
          targets: [
            [
              currentPath.value + file,
              currentPath.value + newname
            ]
          ]
        }
      });
      message.success(t("TXT_CODE_5b990e2e"));
      await getFileList();
    } catch (error: any) {
      return error.message;
    }
  };

  const deleteFile = async (file?: string) => {
    const { execute } = deleteFileApi();
    const useDeleteFileApi = async (files: string[]) => {
      try {
        await execute({
          params: {
            uuid: instanceId || "",
            daemonId: daemonId || ""
          },
          data: {
            targets: files
          }
        });
        await getFileList();
        message.success(t("TXT_CODE_cae10a08"));
        if (dataSource?.value?.length === 0 && operationForm.value.current > 1) {
          operationForm.value.current -= 1;
          await getFileList();
        }
      } catch (error: any) {
        reportErrorMsg(error.message);
      }
    };

    Modal.confirm({
      title: t("TXT_CODE_71155575"),
      icon: createVNode(ExclamationCircleOutlined),
      content: createVNode("div", { style: "color:red;" }, t("TXT_CODE_6a10302d")),
      async onOk() {
        if (!isMultiple.value) {
          await useDeleteFileApi([currentPath.value + file]);
        } else {
          if (!selectionData.value) return reportErrorMsg(t("TXT_CODE_f41ad30a"));
          await useDeleteFileApi(
            selectionData.value.map((e) => currentPath.value + e.name)
          );
        }
      },
      okType: "danger",
      okText: t("TXT_CODE_d507abff"),
      class: "test"
    });
    return;
  };

  const zipFile = async () => {
    if (!selectionData.value || selectionData.value.length === 0)
      return reportErrorMsg(t("TXT_CODE_b152cd75"));
    const filename = await openDialog(t("TXT_CODE_f8a15a94"), t("TXT_CODE_366bad15"), "", "zip");
    const { execute } = compressFileApi();
    const loadingDialog = await openLoadingDialog(
      t("TXT_CODE_b3825da"),
      t("TXT_CODE_ba027d6c"),
      t("TXT_CODE_e1070b52")
    );
    try {
      await execute({
        params: {
          uuid: instanceId || "",
          daemonId: daemonId || ""
        },
        data: {
          type: 1,
          code: "utf-8",
          source: currentPath.value + filename + ".zip",
          targets: selectionData.value.map((e) => currentPath.value + e.name)
        }
      });
      message.success(t("TXT_CODE_c3a933d3"));
      await getFileList();
    } catch (error: any) {
      message.error(t("TXT_CODE_dba9bf61"));
      reportErrorMsg(error.message);
    } finally {
      loadingDialog.cancel();
    }
  };

  const unzipFile = async (name: string) => {
    const dirname = await openDialog(t("TXT_CODE_7669fd3f"), "", "", "unzip");
    const { execute } = compressFileApi();
    const loadingDialog = await openLoadingDialog(
      t("TXT_CODE_b3825da"),
      t("TXT_CODE_b82225c3"),
      t("TXT_CODE_6f038f25")
    );
    try {
      await execute({
        params: {
          uuid: instanceId || "",
          daemonId: daemonId || ""
        },
        data: {
          type: 2,
          code: dialog.value.code,
          source: currentPath.value + name,
          targets:
            dialog.value.unzipmode == "0"
              ? currentPath.value
              : currentPath.value + dirname
        }
      });
      message.success(t("TXT_CODE_c3a933d3"));
      await getFileList();
    } catch (error: any) {
      message.error(t("TXT_CODE_26d7316f"));
      reportErrorMsg(error.message);
    } finally {
      loadingDialog.cancel();
    }
  };

  const spinning = ref(false);

  const selectedFiles = async (files: File[]) => {
    const { state: missionCfg, execute: getUploadMissionCfg } = uploadAddress();
    const fileSet = new Set(files.map((f) => ({ file: f, overwrite: false })));
    const existingFiles: typeof fileSet = new Set();

    for (const f of fileSet) {
      if (dataSource.value?.find((dataType) => dataType.name === f.file.name)) {
        existingFiles.add(f);
      }
    }

    for (const f of existingFiles) {
      const all = ref(false);
      const overwrite = ref(false);
      const confirmPromise = new Promise<boolean>((onComplete) => {
        Modal.confirm({
          title: t("TXT_CODE_99ca8563"),
          icon: createVNode(ExclamationCircleOutlined),
          content: createVNode(
            OverwriteFilesPopUpContent,
            {
              count: existingFiles.size,
              fileName: f.file.name,
              all: all,
              overwrite: overwrite,
              "onUpdate:all": (val: boolean) => (all.value = val),
              "onUpdate:overwrite": (val: boolean) => (overwrite.value = val)
            },
            null
          ),
          okText: t("TXT_CODE_ae09d79d"),
          cancelText: t("TXT_CODE_518528d0"),
          onOk() {
            onComplete(true);
          },
          onCancel() {
            onComplete(false);
          }
        });
      });
      if (await confirmPromise) {
        if (all.value) {
          for (const f of existingFiles) {
            f.overwrite = overwrite.value;
          }
          break;
        }
        f.overwrite = overwrite.value;
        existingFiles.delete(f);
      } else {
        if (all.value) {
          for (const f of existingFiles) {
            fileSet.delete(f);
          }
          break;
        }
        existingFiles.delete(f);
        fileSet.delete(f);
      }
    }

    for (const f of fileSet) {
      try {
        const uploadDir = currentPath.value;
        await getUploadMissionCfg({
          params: {
            upload_dir: uploadDir,
            daemonId: daemonId!,
            uuid: instanceId!,
            file_name: f.file.name
          }
        });
        if (!missionCfg.value) {
          throw new Error(t("TXT_CODE_e8ce38c2"));
        }

        uploadService.append(
          f.file,
          parseForwardAddress(missionCfg.value.addr, "http"),
          missionCfg.value.password,
          {
            overwrite: f.overwrite
          },
          (task) => {
            task.instanceInfo = {
              instanceId: instanceId || "",
              daemonId: daemonId || ""
            };
          }
        );
      } catch (err: any) {
        console.error(err);
        return reportErrorMsg(err.response?.data || err.message);
      }
    }
  };

  const selectChanged = (_selectedRowKeys: Key[], selectedRows: DataType[]) => {
    selectionData.value = selectedRows;
    selectedRowKeys.value = _selectedRowKeys;
  };

  const pushSelected = (key: Key, row: DataType) => {
    const index = selectedRowKeys.value.indexOf(key);
    if (index > -1) return;
    selectionData.value?.push(row);
    selectedRowKeys.value.push(key);
  };

  const oneSelected = (key: Key, row: DataType) => {
    const index = selectedRowKeys.value.indexOf(key);
    if (index > -1) return;
    selectionData.value = [row];
    selectedRowKeys.value = [key];
  };

  const clearSelected = () => {
    selectionData.value = [];
    selectedRowKeys.value = [];
  };

  const rowClickTable = async (item: string, type: number) => {
    if (type === 1) return;
    try {
      spinning.value = true;
      const target = currentPath.value + item + "/";
      breadcrumbs.push({
        path: target,
        name: item,
        disabled: false
      });
      operationForm.value.name = "";
      operationForm.value.current = 1;
      await getFileList(true);
    } catch (error: any) {
      breadcrumbs.splice(breadcrumbs.length - 1, 1);
      return reportErrorMsg(error.message);
    } finally {
      spinning.value = false;
    }
  };

  const getFileLink = async (fileName: string, frontDir?: string) => {
    frontDir = frontDir || currentPath.value;
    const { state: downloadCfg, execute: getDownloadCfg } = downloadAddress();

    try {
      await getDownloadCfg({
        params: {
          file_name: frontDir + fileName,
          daemonId: daemonId || "",
          uuid: instanceId || ""
        }
      });
      if (!downloadCfg.value) return null;
      return `${parseForwardAddress(downloadCfg.value.addr, "http")}/download/${
        downloadCfg.value.password
      }/${fileName}`;
    } catch (err: any) {
      console.error(err);
      return reportErrorMsg(err.message);
    }
  };

  const downloadFile = async (fileName: string) => {
    const link = await getFileLink(fileName);
    if (!link) throw new Error(t("TXT_CODE_6d772765"));
    window.open(link);
  };

  const handleChangeDir = async (dir: string) => {
    const index = breadcrumbs.findIndex((e) => e.path === dir);
    if (index === -1) return reportErrorMsg(t("TXT_CODE_96281410"));
    spinning.value = true;
    breadcrumbs.splice(index + 1);
    operationForm.value.name = "";
    operationForm.value.current = 1;
    await getFileList();
    spinning.value = false;
  };

  const handleTableChange = (e: { current: number; pageSize: number }) => {
    selectedRowKeys.value = [];
    selectionData.value = [];
    operationForm.value.current = e.current;
    operationForm.value.pageSize = e.pageSize;
    getFileList();
  };

  const handleSearchChange = () => {
    operationForm.value.current = 1;
    getFileList();
  };

  const getFileStatus = async () => {
    const { state, execute } = getFileStatusApi();
    try {
      await execute({
        params: {
          daemonId: daemonId || "",
          uuid: instanceId || ""
        }
      });
      if (state.value) {
        fileStatus.value = state.value;
      }
    } catch (err: any) {
      console.error(err);
      return reportErrorMsg(err.message);
    }
  };

  const permission = reactive<Permission>({
    data: { owner: [], usergroup: [], everyone: [] },
    deep: false,
    loading: false,
    item: [
      { key: t("TXT_CODE_2e5d3d0f"), role: "owner" },
      { key: t("TXT_CODE_e7b75c0e"), role: "usergroup" },
      { key: t("TXT_CODE_5c54f599"), role: "everyone" }
    ]
  });

  const changePermission = async (name: string, mode: number) => {
    permission.loading = true;
    permission.data = number2permission(mode);
    permission.loading = false;
    await openDialog(t("TXT_CODE_16853efe"), "", "", "permission", {
      maxWidth: "400px"
    });
    const { execute } = changePermissionApi();
    try {
      await execute({
        params: {
          daemonId: daemonId || "",
          uuid: instanceId || ""
        },
        data: {
          chmod: permission2number(
            permission.data.owner,
            permission.data.usergroup,
            permission.data.everyone
          ),
          deep: permission.deep,
          target: currentPath.value + name
        }
      });
      message.success(t("TXT_CODE_b05948d1"));
      await getFileList();
    } catch (err: any) {
      return reportErrorMsg(err.message);
    }
    permission.deep = false;
  };

  const currentDisk = ref(t("TXT_CODE_28124988"));

  const toDisk = async (disk: string) => {
    const diskName = disk === "/" ? disk : disk + ":\\";
    updateBreadcrumbs(diskName);
    spinning.value = true;
    operationForm.value.name = "";
    operationForm.value.current = 1;
    await getFileList();
    spinning.value = false;
  };

  const isImage = (extName: string) => {
    if (!extName) return;
    return ["JPG", "JPEG", "PNG", "GIF", "BMP", "WEBP", "ICO"].includes(extName.toUpperCase());
  };

  const showImage = (file: DataType) => {
    const frontDir = currentPath.value;
    useImageViewerDialog(instanceId || "", daemonId || "", file.name, frontDir);
  };

  // --- 多分頁功能新增：初始化與清理 ---
  onMounted(() => {
    const oneDay = 24 * 60 * 60 * 1000;
    const now = Date.now();
    Object.keys(tabList.value).forEach(key => {
      const tabs = tabList.value[key];
      if (tabs) {
        tabList.value[key] = tabs.filter(t => !t.pushedTime || (now - t.pushedTime < oneDay));
        if (tabList.value[key].length === 0) delete tabList.value[key];
      }
    });

    if (currentTabs.value.length === 0) {
      initDefaultTab();
    } else {
      activeTab.value = currentTabs.value[0].key;
      handleChangeTab(activeTab.value);
    }
  });

  return {
    fileStatus,
    dialog,
    spinning,
    operationForm,
    dataSource,
    breadcrumbs,
    permission,
    clipboard,
    selectedRowKeys,
    currentDisk,
    selectionData,
    selectChanged,
    isMultiple,
    // --- 多分頁導出 ---
    tabList,
    currentTabKey,
    currentTabs,
    activeTab,
    handleChangeTab,
    onEditTabs,
    // --- 原始導出 ---
    openDialog,
    getFileList,
    touchFile,
    reloadList,
    setClipBoard,
    paste,
    resetName,
    deleteFile,
    zipFile,
    unzipFile,
    selectedFiles,
    rowClickTable,
    downloadFile,
    getFileLink,
    handleChangeDir,
    handleTableChange,
    handleSearchChange,
    getFileStatus,
    changePermission,
    toDisk,
    pushSelected,
    oneSelected,
    isImage,
    showImage
  };
};
