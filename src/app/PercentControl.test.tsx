import {render,screen,fireEvent} from '@testing-library/react';
import {useState} from 'react';
import {expect,it} from 'vitest';
import {PercentControl} from './PercentControl';
function Harness(){const [value,setValue]=useState(1);return <><PercentControl label="가로" value={value} min={.1} max={2} onChange={setValue}/><output aria-label="saved">{value}</output></>;}
it('accepts typed percentages while rejecting blank and out-of-range values',()=>{
 render(<Harness/>);const input=screen.getByRole('spinbutton',{name:'가로 숫자'});
 fireEvent.change(input,{target:{value:'125'}});fireEvent.blur(input);
 expect(screen.getByLabelText('saved')).toHaveTextContent('1.25');expect(screen.getByRole('slider')).toHaveValue('1.25');
 fireEvent.change(input,{target:{value:''}});fireEvent.blur(input);expect(screen.getByLabelText('saved')).toHaveTextContent('1.25');
 fireEvent.change(input,{target:{value:'500'}});fireEvent.blur(input);expect(screen.getByLabelText('saved')).toHaveTextContent('1.25');
 fireEvent.change(screen.getByRole('slider'),{target:{value:'.5'}});expect(input).toHaveValue(50);
});
