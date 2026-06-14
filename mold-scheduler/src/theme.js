import { theme } from "antd";

/** 工业排产场景：紧凑布局、低圆角、中性色 */
export const industrialTheme = {
  algorithm: theme.compactAlgorithm,
  token: {
    colorPrimary: "#0958d9",
    colorBgLayout: "#f0f2f5",
    colorBgContainer: "#ffffff",
    borderRadius: 4,
    fontSize: 13,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  components: {
    Layout: {
      headerBg: "#001529",
      headerHeight: 56,
      headerPadding: "0 24px",
    },
    Menu: {
      itemHeight: 40,
      horizontalItemSelectedColor: "#0958d9",
    },
    Table: {
      headerBg: "#fafafa",
      cellPaddingBlock: 8,
      cellPaddingInline: 12,
    },
    Card: {
      paddingLG: 16,
    },
  },
};
