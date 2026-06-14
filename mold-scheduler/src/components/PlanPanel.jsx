import { Card, Form, InputNumber, Input, Row, Col } from "antd";
import { ScheduleOutlined } from "@ant-design/icons";

export default function PlanPanel({ plan, onChange }) {
  const task = plan[0] || { batches: 1, priority: 1, note: "" };

  const upd = (k, v) => {
    onChange([{ ...task, id: task.id || "t1", [k]: v }]);
  };

  return (
    <Card
      size="small"
      title={<><ScheduleOutlined style={{ marginRight: 8 }} />排产计划</>}
      style={{ maxWidth: 720 }}
    >
      <Form layout="vertical" size="small">
        <Row gutter={24}>
          <Col span={8}>
            <Form.Item label="批次数">
              <InputNumber
                min={1}
                max={20}
                value={task.batches}
                onChange={v => upd("batches", v ?? 1)}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="优先级">
              <InputNumber
                min={1}
                value={task.priority}
                onChange={v => upd("priority", v ?? 1)}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="备注">
              <Input
                value={task.note || ""}
                onChange={e => upd("note", e.target.value)}
                placeholder="可选"
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Card>
  );
}
