import {render,screen,fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it} from 'vitest';
import {PhotoPanelSettings,usePhotoPanelSettings} from './PhotoPanelSettings';
function Harness(){const panel=usePhotoPanelSettings();return <><PhotoPanelSettings {...panel}/><output aria-label="setting">{panel.columns}:{panel.width}</output></>;}
it('expands to four columns and keeps the choice after remount',async()=>{
 localStorage.clear();const user=userEvent.setup();const rendered=render(<Harness/>);
 await user.click(screen.getByRole('button',{name:'미배정 사진 4열'}));expect(screen.getByLabelText('setting')).toHaveTextContent('4:');
 fireEvent.change(screen.getByRole('slider'),{target:{value:'900'}});expect(screen.getByLabelText('setting')).toHaveTextContent('4:900');
 rendered.unmount();render(<Harness/>);expect(screen.getByLabelText('setting')).toHaveTextContent('4:900');
});
it('repairs a stored four-column width and prevents collapsing thumbnails',()=>{
 localStorage.setItem('uws-photo-panel-v1',JSON.stringify({columns:4,width:280}));
 render(<Harness/>);expect(screen.getByLabelText('setting')).toHaveTextContent('4:780');
 fireEvent.change(screen.getByRole('slider'),{target:{value:'280'}});
 expect(screen.getByLabelText('setting')).toHaveTextContent('4:780');
});
