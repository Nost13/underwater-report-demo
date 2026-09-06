import {useReducer} from 'react';
import {render,screen,within,fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it} from 'vitest';
import {SummaryReview} from './SummaryReview';
import {initialReportState,reportReducer} from './reportState';
import {emptyReportInfo} from './reportInfo';
import {createGeneralSections,createNicheSections} from '../domain/structure';
const niche=createNicheSections({component:'Sea Chest',type:'QUANTITY',quantity:2,service:'CLEANING'});
const sections=[createGeneralSections('INSPECTION')[0],...niche];
function Harness({canEdit=true}:{canEdit?:boolean}) {
 const [report,dispatch]=useReducer(reportReducer,{...initialReportState,sections,conditionReviews:{[niche[1].id]:{AFTER:true}}});
 return <><SummaryReview vesselName="QA" info={emptyReportInfo()} onInfoChange={()=>{}} report={report} dispatch={dispatch} canEdit={canEdit} onBack={()=>{}} onNext={()=>{}} onEditDetail={()=>{}}/><output aria-label="source">{report.sections[2].conditions.AFTER?.fouling.coverage}:{String(report.conditionReviews?.[niche[1].id]?.AFTER)}</output></>;
}
it('separates Hull/Niche and edits only the explicitly chosen detail source',async()=>{
 const user=userEvent.setup();render(<Harness/>);
 expect(screen.getByRole('table',{name:'MAIN HULL Finding Matrix'})).toBeVisible();
 const table=screen.getByRole('table',{name:'NICHE Finding Matrix'});
 expect(within(table).queryByText('Rope Guard')).not.toBeInTheDocument();
 await user.click(within(table).getByRole('button',{name:/수정/}));
 expect(screen.queryByLabelText('서머리 fouling coverage')).not.toBeInTheDocument();
 await user.selectOptions(screen.getByLabelText('수정할 원본 구역'),niche[1].id);
 fireEvent.change(screen.getByLabelText('서머리 fouling coverage'),{target:{value:'35'}});
 await user.click(screen.getByRole('button',{name:'원본에 저장'}));
 expect(screen.getByLabelText('source')).toHaveTextContent('35:false');
 expect(within(table).getByText('35%')).toBeVisible();
});
it('keeps condition editing locked until the diagram is confirmed',()=>{
 render(<Harness canEdit={false}/>);
 for(const button of screen.getAllByRole('button',{name:/컨디션 수정/}))expect(button).toBeDisabled();
});
