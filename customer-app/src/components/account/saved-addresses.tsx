import { Home, MapPin, Plus } from 'lucide-react-native'
import { ListGroup, ListRow } from './list-row'

/** Prototype stand-ins until Phase 3 serves /me/addresses. */
const SAMPLE_ADDRESSES = [
  { id: 'home', label: 'Home', line: 'Unit 12B, One Serendra, BGC, Taguig', Icon: Home },
  { id: 'work', label: 'Work', line: '6750 Ayala Ave, Makati', Icon: MapPin },
]

export function SavedAddresses() {
  return (
    <ListGroup title="Saved addresses">
      {SAMPLE_ADDRESSES.map((address) => (
        <ListRow key={address.id} Icon={address.Icon} label={address.label} detail={address.line} />
      ))}
      <ListRow Icon={Plus} label="Add an address" tone="primary" onPress={() => undefined} accessibilityHint="Coming soon" />
    </ListGroup>
  )
}
