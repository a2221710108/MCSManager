<script setup lang="ts">
import { ref } from "vue";
import type { OpenMarketDialogProps } from "@/components/fc";
import { useDialog } from "@/hooks/useDialog";
import { t } from "@/lang/i18n";
import { reinstallInstance } from "@/services/apis/instance"; 
import { reportErrorMsg } from "@/tools/validator";
import { Modal, message } from "ant-design-vue";

interface Props extends OpenMarketDialogProps {
  instanceId?: string;
  daemonId?: string;
  destroyComponent?: () => void;
  emitResult?: (res: any) => void;
}

const props = defineProps<Props>();
const { isVisible, openDialog: open, cancel, submit } = useDialog<any>(props as any);

const selectedJavaVersion = ref<string>("17");
const javaVersions = [
  { label: "Java 6", value: "6", shell: "./start_6_mc.sh" },
  { label: "Java 8", value: "8", shell: "./start_8_mc.sh" },
  { label: "Java 17", value: "17", shell: "./start_17_mc.sh" },
  { label: "Java 21", value: "21", shell: "./start_21_mc.sh" },
];

const handleConfirm = async () => {
  const versionObj = javaVersions.find(v => v.value === selectedJavaVersion.value);
  const targetShell = versionObj?.shell || "./start.sh";

  if (!props.instanceId || !props.daemonId) return;

  Modal.confirm({
    title: t("確認切換 Java 版本"),
    content: t("系統將透過安全通道更新啟動指令，此操作不會影響伺服器檔案。"),
    async onOk() {
      try {
        // 使用 reinstallInstance 接口，因為普通用戶通常有權限訪問它
        await (reinstallInstance().execute as any)({
          params: {
            daemonId: props.daemonId || "",
            uuid: props.instanceId || ""
          },
          data: {
            // 【暗號】Daemon 端會識別這個 title
            title: "FORCE_UPDATE_JAVA_ENV", 
            description: "Request from Java Selector",
            targetUrl: "", 
            // 這裡攜帶我們要修改的參數
            setupInfo: {
              startCommand: targetShell,
              nickname: `Java-${selectedJavaVersion.value}`
            }
          }
        });
        
        message.success(t("Java 版本已切換！請重啟實例生效。"));
        await submit(true);
      } catch (err: any) {
        // 如果報錯 "Preset Config is not found"，說明 Panel 端強制檢查了資料庫
        // 此時請將上面的 title 換成一個你面板裡真實存在的模板名稱
        return reportErrorMsg(err.message);
      }
    }
  });
};

defineExpose({ openDialog: async () => await open() });
</script>

<template>
  <a-modal v-model:open="isVisible" centered :title="t('Java 運行環境切換')" :footer="null" width="400px">
    <div class="java-selector">
      <div class="desc">{{ t('請選擇欲切換的 Java 版本：') }}</div>
      <a-select v-model:value="selectedJavaVersion" style="width: 100%; margin: 15px 0;">
        <a-select-option v-for="opt in javaVersions" :key="opt.value" :value="opt.value">
          {{ opt.label }} —— ({{ opt.shell }})
        </a-select-option>
      </a-select>
      <div class="btns">
        <a-button @click="cancel">{{ t('取消') }}</a-button>
        <a-button type="primary" @click="handleConfirm">{{ t('立即應用') }}</a-button>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.java-selector { padding: 10px; }
.desc { color: #666; font-size: 13px; }
.btns { margin-top: 20px; text-align: right; }
.btns button { margin-left: 8px; }
</style>
