import React from 'react';
import { Badge, Tag, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  DisconnectOutlined
} from '@ant-design/icons';

export type ConnectionStatusType = 
  | 'connected' 
  | 'disconnected' 
  | 'authorizing' 
  | 'error' 
  | 'expired'
  | 'syncing';

interface ConnectionStatusBadgeProps {
  status: ConnectionStatusType;
  lastSync?: string | null;
  size?: 'small' | 'default' | 'large';
  showText?: boolean;
}

export const ConnectionStatusBadge: React.FC<ConnectionStatusBadgeProps> = ({
  status,
  lastSync,
  size = 'default',
  showText = true
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          color: 'success',
          icon: <CheckCircleOutlined />,
          text: 'Connected',
          description: lastSync 
            ? `Last synced: ${new Date(lastSync).toLocaleString()}`
            : 'Ready to sync'
        };
      
      case 'disconnected':
        return {
          color: 'default',
          icon: <DisconnectOutlined />,
          text: 'Disconnected',
          description: 'Not connected to this platform'
        };
      
      case 'authorizing':
        return {
          color: 'processing',
          icon: <SyncOutlined spin />,
          text: 'Authorizing',
          description: 'OAuth authorization in progress'
        };
      
      case 'error':
        return {
          color: 'error',
          icon: <CloseCircleOutlined />,
          text: 'Error',
          description: 'Connection failed - please reconnect'
        };
      
      case 'expired':
        return {
          color: 'warning',
          icon: <ClockCircleOutlined />,
          text: 'Expired',
          description: 'Connection credentials have expired'
        };
      
      case 'syncing':
        return {
          color: 'processing',
          icon: <SyncOutlined spin />,
          text: 'Syncing',
          description: 'Data synchronization in progress'
        };
      
      default:
        return {
          color: 'default',
          icon: <WarningOutlined />,
          text: 'Unknown',
          description: 'Unknown connection status'
        };
    }
  };

  const config = getStatusConfig();

  if (showText) {
    return (
      <Tooltip title={config.description}>
        <Tag
          color={config.color}
          icon={config.icon}
          style={{
            fontSize: size === 'small' ? 12 : size === 'large' ? 16 : 14,
            padding: size === 'small' ? '2px 8px' : size === 'large' ? '6px 14px' : '4px 12px'
          }}
        >
          {config.text}
        </Tag>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={`${config.text}: ${config.description}`}>
      <Badge 
        status={config.color as any} 
        text={config.icon}
      />
    </Tooltip>
  );
};

// Individual status components for convenience
export const ConnectedBadge = () => <ConnectionStatusBadge status="connected" />;
export const DisconnectedBadge = () => <ConnectionStatusBadge status="disconnected" />;
export const AuthorizingBadge = () => <ConnectionStatusBadge status="authorizing" />;
export const ErrorBadge = () => <ConnectionStatusBadge status="error" />;
export const ExpiredBadge = () => <ConnectionStatusBadge status="expired" />;
export const SyncingBadge = () => <ConnectionStatusBadge status="syncing" />;
