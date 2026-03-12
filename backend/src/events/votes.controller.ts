import { Controller, Get, Post, Body, Param, Patch, Delete, Query, Req } from '@nestjs/common';
import { VotesService } from './votes.service';
import { VoteStatus, VoteType } from './vote.entity';

@Controller('api/votes')
export class VotesController {
    constructor(private readonly votesService: VotesService) { }

    @Post()
    create(
        @Query('eventId') eventId: string,
        @Body('question') question: string,
        @Body('type') type: VoteType,
        @Body('options') options: string[]
    ) {
        return this.votesService.createVote(+eventId, question, type, options);
    }

    @Get()
    findAll(@Query('eventId') eventId: string) {
        return this.votesService.findAllByEvent(+eventId);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.votesService.getVoteDetails(+id);
    }

    @Patch(':id/status')
    setStatus(@Param('id') id: string, @Body('status') status: VoteStatus) {
        return this.votesService.setStatus(+id, status);
    }

    @Patch(':id/results')
    setShowResults(@Param('id') id: string, @Body('show') show: boolean) {
        return this.votesService.setShowResults(+id, show);
    }

    @Post(':id/cast')
    cast(
        @Param('id') id: string,
        @Body('optionId') optionId: number,
        @Body('voterToken') voterToken: string,
        @Req() req: any
    ) {
        return this.votesService.castVote(+id, optionId, { ip: req.ip, token: voterToken });
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.votesService.deleteVote(+id);
    }
}
