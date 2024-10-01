import { PanelContainer } from '/@/components/generic/PanelContainer';
import { PanelHeader } from '/@/components/generic/PanelHeader';

export const PanelDocs: React.FC = () => {
  return (
    <PanelContainer>
      <PanelHeader title={'docs'} />
      <iframe
        style={{ width: '100%', height: '100vh', background: 'white' }}
        src={`https://markdown.mtfm.io/#?url=${window.location.origin}${window.location.pathname}/README.md`}
      />
      ,
    </PanelContainer>
  );
};
