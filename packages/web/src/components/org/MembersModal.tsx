import { Modal } from '../common/Modal';
import { useAuth } from '../../store/authStore';
import { OrgMembers } from './OrgMembers';

/** Quick members manager, opened from the Home header so adding a teammate is one click
 *  away rather than buried in Settings. */
export function MembersModal({ onClose }: { onClose: () => void }) {
  const orgName = useAuth((s) => s.profile?.orgName);
  return (
    <Modal
      title={orgName ? `${orgName} · members` : 'Organization members'}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <OrgMembers />
    </Modal>
  );
}
