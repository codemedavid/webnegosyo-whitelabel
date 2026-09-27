import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MemberProgressCard } from './MemberProgress';
it('shows a ready reward alongside a truly empty next card', () => {
 render(<MemberProgressCard progress={{programId:'p',programName:'Coffee card',programStatus:'active',earnMode:'stamp',threshold:10,rewardLabel:'Free coffee',balance:0,lifetimeEarned:10,rewardsIssued:1,rewardsAvailable:1,lastActivityAt:null,remaining:0,percent:100,isDormant:false}} />);
 expect(screen.getByText('1 reward ready')).toBeTruthy();
 expect(screen.getByText('Next reward: 10 more visits')).toBeTruthy();
 expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(0);
});
