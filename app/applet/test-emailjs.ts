import axios from 'axios';

async function test() {
  try {
    const res = await axios.post('https://api.emailjs.com/api/v1.0/email/send', {
      service_id: 'service_sertifikat_nft',
      template_id: 'template-registrasi',
      user_id: 'DFtb3YCdv7x_aIKrk',
      accessToken: '1Fj1TTnxzDPS0XlICLBOC',
      template_params: {
        to_email: 'cicybercreative@gmail.com',
        email: 'cicybercreative@gmail.com',
        user_email: 'cicybercreative@gmail.com',
        send_to: 'cicybercreative@gmail.com',
        recipient: 'cicybercreative@gmail.com',
        to_name: 'testuser',
        username: 'testuser',
        link: 'https://example.com/test',
        url: 'https://example.com/test',
        action_link: 'https://example.com/test',
        confirmation_link: 'https://example.com/test'
      }
    });
    console.log('Success:', res.data);
  } catch (err: any) {
    console.error('Error:', err.response?.data || err.message);
  }
}

test();
